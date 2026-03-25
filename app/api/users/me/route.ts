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

// GET /api/users/me — fetch own profile
export async function GET(req: NextRequest) {
  const { supabase, user } = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
  const { data, error } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ user: data })
}

// PATCH /api/users/me — update own profile
export async function PATCH(req: NextRequest) {
  const { supabase, user } = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const body = await req.json()
  const allowed = ['first_name', 'last_name', 'bio', 'instagram', 'linkedin', 'airbnb', 'star_sign', 'viewing_url']
  const updates: Record<string, string> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await supabase.from('users').update(updates).eq('id', user.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ user: data })
}
