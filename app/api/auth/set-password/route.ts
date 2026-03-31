import { NextRequest, NextResponse } from 'next/server'

// POST /api/auth/set-password — set new password using a recovery token
// Proxies to Supabase so the anon key is never exposed in client code
export async function POST(req: NextRequest) {
  const { password, recovery_token } = await req.json()
  if (!password || !recovery_token) {
    return NextResponse.json({ error: 'password and recovery_token required.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${recovery_token}`,
      'apikey': anonKey,
    },
    body: JSON.stringify({ password }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return NextResponse.json({ error: err.message || 'Failed to update password.' }, { status: res.status })
  }

  return NextResponse.json({ success: true })
}
