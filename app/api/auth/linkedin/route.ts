import { NextResponse } from 'next/server'

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.housefolk.co'
  const redirectTo = encodeURIComponent(`${appUrl}/housefolk.html`)

  const oauthUrl = `${supabaseUrl}/auth/v1/authorize?provider=linkedin_oidc&redirect_to=${redirectTo}`

  return NextResponse.redirect(oauthUrl)
}
