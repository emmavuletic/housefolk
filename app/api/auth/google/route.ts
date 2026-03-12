import { NextResponse } from 'next/server'

export async function GET() {
  const supabaseUrl = 'https://agfgtajovhhxswfdcqen.supabase.co'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.housefolk.co'
  const redirectTo = encodeURIComponent(`${appUrl}/homefolk.html`)

  const oauthUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${redirectTo}`

  return NextResponse.redirect(oauthUrl)
}
