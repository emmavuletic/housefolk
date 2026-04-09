import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServerClient } from '@/lib/supabase-server'
import { resend, FROM_EMAIL, ADMIN_EMAIL } from '@/lib/resend'
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

  switch (event.type) {
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

      if (listing_id) {
        const { data: listing } = await supabase
          .from('listings')
          .select('*, users(email, first_name)')
          .eq('id', listing_id)
          .single()

        if (listing) {
          const expiresAt = new Date()
          expiresAt.setDate(expiresAt.getDate() + 7)
          await supabase.from('listings').update({
            stripe_subscription_id: session.subscription as string,
            status: 'active',
            goes_live_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
          }).eq('id', listing_id)

          // Email landlord confirmation
          const landlordData = listing.users as { email: string; first_name: string } | null
          if (landlordData?.email) {
            await resend.emails.send({
              from: FROM_EMAIL,
              to: landlordData.email,
              subject: `Your Housefolk listing is now live`,
              html: `
                <p>Hi ${landlordData.first_name},</p>
                <p>Your listing <strong>${listing.title}</strong> is now live on Housefolk and will be featured in the Thursday newsletter.</p>
                <p>You'll start receiving enquiries shortly.</p>
                <p>— The Housefolk team</p>
              `,
            })
          }
        }
      }
      break
    }

    case 'invoice.payment_succeeded': {
      // Extend listing by 7 days on each successful weekly renewal
      const invoice = event.data.object as Stripe.Invoice
      const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id
      if (subId && invoice.billing_reason === 'subscription_cycle') {
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 7)
        await supabase.from('listings')
          .update({ status: 'active', expires_at: expiresAt.toISOString() })
          .eq('stripe_subscription_id', subId)
      }
      break
    }

    case 'charge.refunded': {
      // Expire listing immediately when a refund is issued
      const charge = event.data.object as Stripe.Charge
      const paymentIntent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
      if (paymentIntent) {
        // Find the checkout session linked to this payment intent
        const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntent, limit: 1 })
        const listingId = sessions.data[0]?.metadata?.listing_id
        if (listingId) {
          await supabase.from('listings')
            .update({ status: 'expired' })
            .eq('id', listingId)
        }
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      // Expire listing if this is a listing subscription
      await supabase.from('listings')
        .update({ status: 'expired' })
        .eq('stripe_subscription_id', sub.id)
      // Also handle tenant subscriptions
      await supabase.from('users')
        .update({ tenant_subscription_status: 'cancelled', tenant_subscription_id: null })
        .eq('tenant_subscription_id', sub.id)
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      // Expire listing on payment failure
      if (['past_due', 'unpaid', 'canceled'].includes(sub.status)) {
        await supabase.from('listings')
          .update({ status: 'expired' })
          .eq('stripe_subscription_id', sub.id)
      }
      // Also handle tenant subscriptions
      await supabase.from('users')
        .update({ tenant_subscription_status: sub.status })
        .eq('tenant_subscription_id', sub.id)
      break
    }
  }

  return NextResponse.json({ received: true })
}
