import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const { refresh_token } = await req.json()
  if (!refresh_token) return NextResponse.json({ error: 'No refresh token.' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase.auth.refreshSession({ refresh_token })
  if (error || !data.session) return NextResponse.json({ error: 'Session expired. Please sign in again.' }, { status: 401 })

  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
  })
}
