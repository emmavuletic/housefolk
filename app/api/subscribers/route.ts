import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { rateLimit } from '@/lib/rate-limit'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim())

// GET /api/subscribers — admin only
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const token = auth.replace('Bearer ', '')
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Invalid token.' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('role, email').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin' || ADMIN_EMAILS.includes(profile?.email || '')
  if (!isAdmin) return NextResponse.json({ error: 'Admin only.' }, { status: 403 })

  const { data, error } = await supabase
    .from('subscribers')
    .select('*')
    .order('subscribed_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ subscribers: data })
}

// POST /api/subscribers — public subscribe
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  if (!rateLimit(`subscribe:${ip}`, 3, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const { email, name } = await req.json()
  if (!email) return NextResponse.json({ error: 'Email required.' }, { status: 400 })

  const supabase = createServerClient()
  const { error } = await supabase.from('subscribers').upsert({
    email: email.toLowerCase().trim(),
    name: name?.trim() || null,
    active: true,
    source: 'website',
  }, { onConflict: 'email' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
