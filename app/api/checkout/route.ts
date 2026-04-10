import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { stripe, PRICES } from '@/lib/stripe'

// POST /api/checkout — create Stripe Checkout session for a listing
export async function POST(req: NextRequest) {
  try {
  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const token = auth.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Invalid token.' }, { status: 401 })

  const { listing_id, type, promo_code } = await req.json()
  if (!listing_id || !type) {
    return NextResponse.json({ error: 'listing_id and type required.' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.housefolk.co'

  // Validate promo code if provided
  if (promo_code) {
    const { data: promo } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', promo_code.toUpperCase())
      .eq('active', true)
      .single()

    if (promo) {
      const isValid =
        (!promo.expiry || new Date(promo.expiry) > new Date()) &&
        (!promo.max_uses || promo.uses_count < promo.max_uses) &&
        (promo.discount_type === 'free-any' || promo.discount_type === `free-${type}`)

      if (isValid) {
        // Verify listing belongs to this user before activating
        const { data: ownedListing } = await supabase
          .from('listings').select('id').eq('id', listing_id).eq('landlord_id', user.id).single()
        if (!ownedListing) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })

        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 7)
        await supabase.from('listings').update({
          status: 'active',
          promo_code_used: promo_code.toUpperCase(),
          goes_live_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        }).eq('id', listing_id).eq('landlord_id', user.id)

        await supabase.from('promo_codes')
          .update({ uses_count: (promo.uses_count || 0) + 1 })
          .eq('id', promo.id)

        return NextResponse.json({ free: true, redirect: `${appUrl}?success=listing` })
      }
    }
    return NextResponse.json({ error: 'Invalid or expired promo code.' }, { status: 400 })
  }

  const priceId = PRICES[type as keyof typeof PRICES]
  if (!priceId) return NextResponse.json({ error: 'Invalid listing type.' }, { status: 400 })

  // Get or create Stripe customer
  const { data: profile } = await supabase
    .from('users')
    .select('stripe_customer_id, email')
    .eq('id', user.id)
    .single()

  let customerId = profile?.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({ email: profile?.email || user.email })
    customerId = customer.id
    await supabase.from('users').update({ stripe_customer_id: customerId }).eq('id', user.id)
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    metadata: { listing_id, user_id: user.id, type },
    success_url: `${appUrl}?success=listing&listing_id=${listing_id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}?cancelled=true`,
    subscription_data: { metadata: { listing_id, user_id: user.id } },
  })

  return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('Checkout error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
