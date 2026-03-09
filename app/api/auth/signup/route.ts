import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { rateLimit } from '@/lib/rate-limit'
import { resend, FROM_EMAIL } from '@/lib/resend'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  if (!rateLimit(`signup:${ip}`, 5, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  const { email, password, first_name, last_name, role, subscribe_newsletter } = await req.json()

  if (!email || !password || !first_name) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data, error } = await supabase.auth.admin.createUser({
    email: email.toLowerCase().trim(),
    password,
    email_confirm: true,
    user_metadata: { first_name, last_name, role: role || 'tenant' },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Add to newsletter if opted in
  if (subscribe_newsletter && data.user) {
    await supabase.from('subscribers').upsert({
      email: email.toLowerCase().trim(),
      name: `${first_name} ${last_name}`.trim(),
      source: 'signup',
      active: true,
    }, { onConflict: 'email' })
  }


  return NextResponse.json({ success: true, message: 'Account created. Please check your email to verify.' })
}
