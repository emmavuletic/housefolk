import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

async function getAuthUser(req: NextRequest) {
  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return null
  const token = auth.replace('Bearer ', '')
  const { data: { user } } = await supabase.auth.getUser(token)
  return user
}

// GET /api/listings/[id] — single listing (public)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('listings')
    .select(`
      id, type, title, location, price, beds, baths,
      bills_included, furnished, pet_friendly, description, motto,
      available_date, sublet_until, photos, star_signs, music_vibes,
      spotify_url, instagram, linkedin, airbnb,
      status, goes_live_at, expires_at, landlord_id
    `)
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  return NextResponse.json({ listing: data })
}

// PATCH /api/listings/[id] — update listing (owner only)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const { data: existing } = await supabase
    .from('listings')
    .select('landlord_id')
    .eq('id', params.id)
    .single()

  if (!existing || existing.landlord_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const body = await req.json()

  // Whitelist only fields an owner is allowed to edit
  const ALLOWED_FIELDS = [
    'title', 'location', 'price', 'beds', 'baths', 'bills_included',
    'furnished', 'pet_friendly', 'description', 'motto', 'available_date',
    'sublet_until', 'star_signs', 'music_vibes', 'spotify_url',
    'instagram', 'linkedin', 'airbnb', 'photos', 'newsletter_included',
  ]

  // Admins can also set status and dates (e.g. to activate a draft listing)
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role === 'admin') {
    ALLOWED_FIELDS.push('status', 'goes_live_at', 'expires_at')
  }

  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED_FIELDS) {
    if (key in body) updates[key] = body[key]
  }

  if (Array.isArray(updates.photos) && (updates.photos as unknown[]).length > 10) {
    return NextResponse.json({ error: 'Maximum 10 photos per listing.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('listings')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ listing: data })
}

// DELETE /api/listings/[id] — delete listing (owner only)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const { data: existing } = await supabase
    .from('listings')
    .select('landlord_id')
    .eq('id', params.id)
    .single()

  if (!existing || existing.landlord_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const { error } = await supabase.from('listings').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
