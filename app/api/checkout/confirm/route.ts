import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { stripe } from '@/lib/stripe'
import { resend, FROM_EMAIL } from '@/lib/resend'

// POST /api/checkout/confirm — verify Stripe session and activate listing
// Called client-side on Stripe success redirect as a fallback to webhooks
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const token = auth.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Invalid token.' }, { status: 401 })

  const { session_id, listing_id } = await req.json()
  if (!session_id || !listing_id) {
    return NextResponse.json({ error: 'session_id and listing_id required.' }, { status: 400 })
  }

  // Retrieve session directly from Stripe — cannot be faked
  let session
  try {
    session = await stripe.checkout.sessions.retrieve(session_id)
  } catch {
    return NextResponse.json({ error: 'Could not verify payment.' }, { status: 400 })
  }

  // Verify payment was actually completed
  if (session.payment_status !== 'paid' && session.status !== 'complete') {
    return NextResponse.json({ error: 'Payment not completed.' }, { status: 402 })
  }

  // Verify the session belongs to this listing and this user
  if (session.metadata?.listing_id !== listing_id || session.metadata?.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  // Check listing belongs to this user
  const { data: listing } = await supabase
    .from('listings')
    .select('*, users(email, first_name)')
    .eq('id', listing_id)
    .eq('landlord_id', user.id)
    .single()

  if (!listing) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })

  // Already active — idempotent, just return success
  if (listing.status === 'active') return NextResponse.json({ ok: true })

  // Activate listing and save subscription ID
  await supabase.from('listings').update({
    status: 'active',
    stripe_subscription_id: session.subscription as string ?? listing.stripe_subscription_id,
  }).eq('id', listing_id)

  // Send confirmation email if not already sent
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

  return NextResponse.json({ ok: true })
}
