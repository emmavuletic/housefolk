import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// GET /api/listings — public browse (active listings only)
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const location = searchParams.get('location')

  let query = supabase
    .from('listings')
    .select(`
      id, type, title, location, price, beds, baths,
      bills_included, description, motto, available_date,
      photos, star_signs, music_vibes, spotify_url,
      instagram, linkedin, airbnb, status, goes_live_at,
      landlord_id
    `)
    .eq('status', 'active')
    .order('goes_live_at', { ascending: false })

  if (type) query = query.eq('type', type)
  if (location) query = query.ilike('location', `%${location}%`)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ listings: data })
}

// POST /api/listings — create listing draft (auth required)
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const token = auth.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    console.error('[listings POST] Auth error:', authError?.message)
    return NextResponse.json({ error: 'Invalid token.' }, { status: 401 })
  }

  const body = await req.json()
  const {
    type, title, location, price, beds, baths,
    bills_included, furnished, pet_friendly, description,
    motto, available_date, sublet_until, star_signs,
    music_vibes, spotify_url, instagram, linkedin, airbnb, photos
  } = body

  if (!type || !title || !location) {
    return NextResponse.json({ error: 'Type, title and location are required.' }, { status: 400 })
  }

  if (Array.isArray(photos) && photos.length > 10) {
    return NextResponse.json({ error: 'Maximum 10 photos per listing.' }, { status: 400 })
  }

  const now = new Date()
  const goesLive = now

  const expiresAt = new Date(now)
  expiresAt.setDate(now.getDate() + 7)

  const { data, error } = await supabase.from('listings').insert({
    landlord_id: user.id,
    type,
    title: title.trim(),
    location: location.trim(),
    price: price ? Math.round(parseFloat(price) * 100) : null, // store in pence
    beds: beds ? parseInt(beds, 10) : null,
    baths: baths ? parseInt(baths, 10) : null,
    bills_included: bills_included || false,
    furnished,
    pet_friendly,
    description: description?.trim(),
    motto: motto?.trim(),
    available_date,
    sublet_until,
    star_signs: star_signs || [],
    music_vibes: music_vibes || [],
    spotify_url,
    instagram,
    linkedin,
    airbnb,
    photos: photos || [],
    status: 'active',
    goes_live_at: goesLive.toISOString(),
    expires_at: expiresAt.toISOString(),
  }).select().single()

  if (error) {
    console.error('[listings POST] DB error:', error.message, error.code)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    console.error('[listings POST] No data returned from insert')
    return NextResponse.json({ error: 'Listing was not saved. Please try again.' }, { status: 500 })
  }
  return NextResponse.json({ listing: data }, { status: 201 })
}
