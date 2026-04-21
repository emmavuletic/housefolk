import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// POST /api/checkout/confirm — check listing activation status after Stripe redirect
// Activation is handled entirely by Stripe webhooks (invoice.paid).
// This endpoint only reports whether the webhook has already fired.
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const token = auth.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Invalid token.' }, { status: 401 })

  const { listing_id } = await req.json()
  if (!listing_id) return NextResponse.json({ error: 'listing_id required.' }, { status: 400 })

  const { data: listing } = await supabase
    .from('listings')
    .select('id, status, access_expires_at')
    .eq('id', listing_id)
    .eq('landlord_id', user.id)
    .single()

  if (!listing) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })

  return NextResponse.json({
    status: listing.status,
    active: listing.status === 'active',
    access_expires_at: listing.access_expires_at,
  })
}
