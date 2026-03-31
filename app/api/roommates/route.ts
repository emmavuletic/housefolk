import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// GET /api/roommates — returns users who have opted in to the roommate directory
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const token = auth.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Invalid token.' }, { status: 401 })

  const { data, error } = await supabase
    .from('users')
    .select('id, first_name, last_name, bio, job_title, company, star_sign, instagram, linkedin, interests, pet_peeves, hopes_dreams, hard_nos, daily_schedule, avatar_url')
    .eq('show_in_roommates', true)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ roommates: data ?? [] })
}
