import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { refresh_token } = await req.json()
  if (!refresh_token) return NextResponse.json({ error: 'No refresh token.' }, { status: 400 })

  const supabaseUrl = 'https://agfgtajovhhxswfdcqen.supabase.co'
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SECRET_KEY!,
    },
    body: JSON.stringify({ refresh_token }),
  })

  if (!res.ok) return NextResponse.json({ error: 'Session expired. Please sign in again.' }, { status: 401 })

  const data = await res.json()
  return NextResponse.json({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  })
}
