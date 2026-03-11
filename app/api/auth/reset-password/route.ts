import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  if (!rateLimit(`reset:${ip}`, 3, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'Email required.' }, { status: 400 })

  const supabase = createServerClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.housefolk.co'

  // Generate a reset link via Supabase admin, send it ourselves via Resend
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: email.toLowerCase().trim(),
    options: { redirectTo: `${appUrl}/homefolk.html` },
  })

  if (!error && data?.properties?.action_link) {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email.toLowerCase().trim(),
      subject: 'Reset your Housefolk password',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem">
          <h2 style="font-family:Georgia,serif;font-weight:400">Reset your password</h2>
          <p style="color:#5A4F45;line-height:1.6">Click the button below to set a new password for your Housefolk account.</p>
          <a href="${data.properties.action_link}" style="display:inline-block;margin:1.5rem 0;background:#f7b188;color:#fff;text-decoration:none;padding:0.75rem 1.8rem;border-radius:8px;font-weight:600">Reset password →</a>
          <p style="color:#8A7E74;font-size:0.82rem">If you didn't request this, you can safely ignore this email. The link expires in 1 hour.</p>
          <p style="color:#8A7E74;font-size:0.82rem;margin-top:2rem">— The Housefolk team</p>
        </div>
      `,
    })
  }

  // Always return success to prevent email enumeration
  return NextResponse.json({ success: true, message: 'If an account exists, a reset link has been sent.' })
}
