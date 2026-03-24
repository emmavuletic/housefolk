import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// GET /api/subscribers/unsubscribe?email=... — one-click unsubscribe from newsletter
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'Email required.' }, { status: 400 })

  const supabase = createServerClient()
  await supabase.from('subscribers').update({
    active: false,
    unsubscribed_at: new Date().toISOString(),
  }).eq('email', email.toLowerCase())

  return new NextResponse(
    `<html><body style="font-family:sans-serif;text-align:center;padding:3rem">
      <h2>You've been unsubscribed</h2>
      <p>You won't receive any more newsletters from Housefolk.</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}">Return to Housefolk</a></p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}
