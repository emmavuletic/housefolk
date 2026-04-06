import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim())

async function isAdmin(supabase: ReturnType<typeof createServerClient>, token: string) {
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return false
  const { data: profile } = await supabase.from('users').select('role, email').eq('id', user.id).single()
  return profile?.role === 'admin' || ADMIN_EMAILS.includes(profile?.email || '')
}

// GET /api/promos — admin: all codes; public: validate a single code
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  // Public: validate a promo code
  if (code) {
    const { data } = await supabase
      .from('promo_codes')
      .select('code, discount_type, description, expiry, max_uses, uses_count, active')
      .eq('code', code.toUpperCase())
      .single()

    if (!data || !data.active) {
      return NextResponse.json({ valid: false, error: 'Invalid or expired code.' })
    }
    if (data.expiry && new Date(data.expiry) < new Date()) {
      return NextResponse.json({ valid: false, error: 'This code has expired.' })
    }
    if (data.max_uses && data.uses_count >= data.max_uses) {
      return NextResponse.json({ valid: false, error: 'This code has reached its usage limit.' })
    }
    return NextResponse.json({ valid: true, discount_type: data.discount_type, description: data.description })
  }

  // Admin: all codes
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
  if (!await isAdmin(supabase, auth.replace('Bearer ', ''))) {
    return NextResponse.json({ error: 'Admin only.' }, { status: 403 })
  }

  const { data, error } = await supabase.from('promo_codes').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ promos: data })
}

// POST /api/promos — admin: create promo code
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
  if (!await isAdmin(supabase, auth.replace('Bearer ', ''))) {
    return NextResponse.json({ error: 'Admin only.' }, { status: 403 })
  }

  const { code, discount_type, max_uses, expiry, note } = await req.json()
  if (!code) return NextResponse.json({ error: 'Code required.' }, { status: 400 })

  const clean = code.toUpperCase().trim().replace(/\s+/g, '')
  const { data, error } = await supabase.from('promo_codes').insert({
    code: clean,
    discount_type: discount_type || 'free-flatshare',
    max_uses: max_uses || null,
    expiry: expiry || null,
    note: note || null,
    active: true,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ promo: data }, { status: 201 })
}

// PATCH /api/promos — admin: toggle active / update
export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
  if (!await isAdmin(supabase, auth.replace('Bearer ', ''))) {
    return NextResponse.json({ error: 'Admin only.' }, { status: 403 })
  }

  const body = await req.json()
  const { code } = body
  if (!code) return NextResponse.json({ error: 'Code required.' }, { status: 400 })

  const ALLOWED = ['active', 'discount_type', 'max_uses', 'expiry', 'note']
  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await supabase
    .from('promo_codes')
    .update(updates)
    .eq('code', code.toUpperCase())
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ promo: data })
}

// DELETE /api/promos — admin: delete promo code
export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
  if (!await isAdmin(supabase, auth.replace('Bearer ', ''))) {
    return NextResponse.json({ error: 'Admin only.' }, { status: 403 })
  }

  const { code } = await req.json()
  if (!code) return NextResponse.json({ error: 'Code required.' }, { status: 400 })

  const { error } = await supabase.from('promo_codes').delete().eq('code', code.toUpperCase())
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
