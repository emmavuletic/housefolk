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
        await supabase.from('listings').update({
          stripe_payment_intent_id: session.payment_intent as string,
        }).eq('id', listing_id)
      }
      break
    }

    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent
      const { listing_id } = pi.metadata || {}

      if (listing_id) {
        const { data: listing } = await supabase
          .from('listings')
          .select('*, users(email, first_name)')
          .eq('id', listing_id)
          .single()

        if (listing) {
          await supabase.from('listings').update({
            status: 'pending', // goes active on Thursday
          }).eq('id', listing_id)

          // Email landlord confirmation
          const landlordData = listing.users as { email: string; first_name: string } | null
          if (landlordData?.email) {
            const goesLive = listing.goes_live_at
              ? new Date(listing.goes_live_at).toLocaleDateString('en-GB', {
                  weekday: 'long', day: 'numeric', month: 'long'
                })
              : 'this Thursday'

            await resend.emails.send({
              from: FROM_EMAIL,
              to: landlordData.email,
              subject: `Your Housefolk listing is confirmed — goes live ${goesLive}`,
              html: `
                <p>Hi ${landlordData.first_name},</p>
                <p>Your listing <strong>${listing.title}</strong> has been confirmed and will go live on <strong>${goesLive}</strong> when the Thursday newsletter sends.</p>
                <p>You'll start receiving enquiries from that date.</p>
                <p>— The Housefolk team</p>
              `,
            })
          }
        }
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      await supabase.from('users')
        .update({ tenant_subscription_status: 'cancelled', tenant_subscription_id: null })
        .eq('tenant_subscription_id', sub.id)
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      await supabase.from('users')
        .update({ tenant_subscription_status: sub.status })
        .eq('tenant_subscription_id', sub.id)
      break
    }
  }

  return NextResponse.json({ received: true })
}
