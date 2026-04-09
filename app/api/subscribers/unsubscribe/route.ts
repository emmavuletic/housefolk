import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createHmac, timingSafeEqual } from 'crypto'
import { rateLimit } from '@/lib/rate-limit'

function expectedToken(email: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET || ''
  return createHmac('sha256', secret).update(email.toLowerCase()).digest('hex')
}

// GET /api/subscribers/unsubscribe?email=...&token=... — one-click unsubscribe from newsletter
export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  if (!await rateLimit(`unsubscribe:${ip}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')
  const token = searchParams.get('token')

  if (!email || !token) return NextResponse.json({ error: 'Invalid unsubscribe link.' }, { status: 400 })

  // Verify HMAC token
  const expected = expectedToken(email)
  let valid = false
  try {
    valid = token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  } catch { valid = false }

  if (!valid) return NextResponse.json({ error: 'Invalid unsubscribe link.' }, { status: 403 })

  const supabase = createServerClient()
  await supabase.from('subscribers').update({
    active: false,
    unsubscribed_at: new Date().toISOString(),
  }).eq('email', email.toLowerCase())

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.housefolk.co'
  return new NextResponse(
    `<html><body style="font-family:sans-serif;text-align:center;padding:3rem">
      <h2>You've been unsubscribed</h2>
      <p>You won't receive any more newsletters from Housefolk.</p>
      <p><a href="${appUrl}">Return to Housefolk</a></p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}
