import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

async function getUser(req: NextRequest) {
  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return { supabase, user: null }
  const token = auth.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return { supabase, user: null }
  return { supabase, user }
}

// POST /api/listings/[id]/save — save a listing
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, user } = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const { data: listing } = await supabase.from('listings').select('id').eq('id', params.id).single()
  if (!listing) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })

  const { error } = await supabase
    .from('saved_listings')
    .upsert({ user_id: user.id, listing_id: params.id }, { onConflict: 'user_id,listing_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ saved: true })
}

// DELETE /api/listings/[id]/save — unsave a listing
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, user } = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const { error } = await supabase
    .from('saved_listings')
    .delete()
    .eq('user_id', user.id)
    .eq('listing_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ saved: false })
}
