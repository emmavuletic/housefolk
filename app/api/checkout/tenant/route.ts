import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { stripe, PRICES } from '@/lib/stripe'

// POST /api/checkout/tenant — £15/month tenant subscription
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const token = auth.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Invalid token.' }, { status: 401 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.housefolk.co'

  const { data: profile } = await supabase
    .from('users')
    .select('stripe_customer_id, email, tenant_subscription_status')
    .eq('id', user.id)
    .single()

  if (profile?.tenant_subscription_status === 'active') {
    return NextResponse.json({ error: 'Already subscribed.' }, { status: 400 })
  }

  let customerId = profile?.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({ email: profile?.email || user.email })
    customerId = customer.id
    await supabase.from('users').update({ stripe_customer_id: customerId }).eq('id', user.id)
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: PRICES.tenant, quantity: 1 }],
    metadata: { user_id: user.id, type: 'tenant_subscription' },
    success_url: `${appUrl}?success=subscription`,
    cancel_url: `${appUrl}?cancelled=true`,
  })

  return NextResponse.json({ url: session.url })
}
