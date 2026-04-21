import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServerClient } from '@/lib/supabase-server'
import { resend, FROM_EMAIL } from '@/lib/resend'
import Stripe from 'stripe'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'Webhook signature invalid.' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Atomic idempotency guard — INSERT the event ID or skip if already seen.
  // ON CONFLICT DO NOTHING means two concurrent deliveries of the same event
  // both attempt the insert; exactly one succeeds, the other gets 0 rows back.
  const { count } = await supabase
    .from('stripe_events')
    .insert({
      id:      event.id,
      type:    event.type,
      created: new Date(event.created * 1000).toISOString(),
    }, { count: 'exact' })
    .onConflict('id')
    .ignore()

  if (count === 0) {
    // Already processed — safe to acknowledge without doing anything
    return NextResponse.json({ received: true, duplicate: true })
  }

  switch (event.type) {

    // ── Step 1: Checkout completed — link subscription to listing ──
    // Does NOT activate. Activation happens only when invoice.paid confirms payment.
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const { listing_id, user_id, type } = session.metadata || {}

      if (type === 'tenant_subscription') {
        await supabase.from('users').update({
          tenant_subscription_id: session.subscription as string,
          tenant_subscription_status: 'active',
        }).eq('id', user_id)
        break
      }

      if (listing_id && session.subscription) {
        await supabase.from('listings').update({
          stripe_subscription_id: session.subscription as string,
          stripe_checkout_session_id: session.id,
        }).eq('id', listing_id).eq('landlord_id', user_id)
      }
      break
    }

    // ── Step 2: Invoice paid — activate or extend listing ──
    // Fires on first payment AND every weekly renewal.
    // This is the single source of truth for granting access.
    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      const subId = typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id
      if (!subId) break

      // Retrieve subscription to get the paid-through date
      const subscription = await stripe.subscriptions.retrieve(subId)
      const accessExpiresAt = new Date(subscription.current_period_end * 1000).toISOString()

      // Find listing by subscription ID
      let { data: listing } = await supabase
        .from('listings')
        .select('id, status, activated_at, landlord_id, title, users(email, first_name)')
        .eq('stripe_subscription_id', subId)
        .single()

      // Race-condition fallback: invoice.paid may arrive before checkout.session.completed
      // In that case, look up the checkout session to find the listing
      if (!listing && invoice.billing_reason === 'subscription_create') {
        const sessions = await stripe.checkout.sessions.list({ subscription: subId, limit: 1 })
        const listingId = sessions.data[0]?.metadata?.listing_id
        const sessionId = sessions.data[0]?.id
        if (listingId) {
          await supabase.from('listings').update({
            stripe_subscription_id: subId,
            stripe_checkout_session_id: sessionId,
          }).eq('id', listingId)

          const { data } = await supabase
            .from('listings')
            .select('id, status, activated_at, landlord_id, title, users(email, first_name)')
            .eq('id', listingId)
            .single()
          listing = data
        }
      }

      if (!listing) break

      const isFirstActivation = !listing.activated_at
      const now = new Date().toISOString()

      await supabase.from('listings').update({
        status: 'active',
        subscription_status: 'active',
        cancel_at_period_end: false,
        access_expires_at: accessExpiresAt,
        last_invoice_paid_at: now,
        ...(isFirstActivation && {
          activated_at: now,
          goes_live_at: now,
        }),
      }).eq('id', listing.id)

      // Confirmation email on first activation only
      if (isFirstActivation) {
        const landlord = listing.users as { email: string; first_name: string } | null
        if (landlord?.email) {
          await resend.emails.send({
            from: FROM_EMAIL,
            to: landlord.email,
            subject: 'Your Housefolk listing is now live',
            html: `
              <p>Hi ${landlord.first_name},</p>
              <p>Your listing <strong>${listing.title}</strong> is now live on Housefolk.</p>
              <p>You'll receive an email each time someone messages you.</p>
              <p>— The Housefolk team</p>
            `,
          })
        }
      }
      break
    }

    // ── Invoice payment failed — mark listing as overdue ──
    // Does NOT change access_expires_at — listing stays live until the paid period ends.
    // Stripe will retry; if it ultimately gives up, subscription.updated fires with past_due.
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const subId = typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id
      if (!subId) break

      await supabase.from('listings').update({
        subscription_status: 'past_due',
      }).eq('stripe_subscription_id', subId)
      break
    }

    // ── Subscription updated — handle cancellation and status changes ──
    // When a user cancels: Stripe sets cancel_at_period_end = true but keeps
    // the subscription active. Listing stays live until access_expires_at.
    // The cron job expires it once that date passes.
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const accessExpiresAt = new Date(sub.current_period_end * 1000).toISOString()

      await supabase.from('listings').update({
        subscription_status: sub.status,
        cancel_at_period_end: sub.cancel_at_period_end,
        canceled_at: sub.canceled_at
          ? new Date(sub.canceled_at * 1000).toISOString()
          : null,
        access_expires_at: accessExpiresAt,
      }).eq('stripe_subscription_id', sub.id)

      // Also handle tenant subscriptions
      await supabase.from('users')
        .update({ tenant_subscription_status: sub.status })
        .eq('tenant_subscription_id', sub.id)
      break
    }

    // ── Subscription deleted — mark as cancelled, do NOT immediately expire ──
    // Listing stays live until access_expires_at. Cron handles the expiry.
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription

      await supabase.from('listings').update({
        subscription_status: 'canceled',
        cancel_at_period_end: false,
        canceled_at: sub.canceled_at
          ? new Date(sub.canceled_at * 1000).toISOString()
          : new Date().toISOString(),
      }).eq('stripe_subscription_id', sub.id)

      await supabase.from('users')
        .update({ tenant_subscription_status: 'cancelled', tenant_subscription_id: null })
        .eq('tenant_subscription_id', sub.id)
      break
    }
  }

  return NextResponse.json({ received: true })
}
