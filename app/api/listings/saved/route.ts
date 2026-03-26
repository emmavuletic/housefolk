import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// GET /api/listings/saved — get all saved listings for the current user
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const token = auth.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Invalid token.' }, { status: 401 })

  const { data, error } = await supabase
    .from('saved_listings')
    .select(`
      listing_id,
      created_at,
      listing:listings!saved_listings_listing_id_fkey(
        id, type, title, location, price, beds, baths, photos, status, goes_live_at
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ listings: [] }) // table may not exist yet
  return NextResponse.json({ listings: (data || []).map(r => r.listing).filter(Boolean) })
}
