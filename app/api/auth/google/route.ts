import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.housefolk.co'

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${appUrl}/homefolk.html`,
    },
  })

  if (error || !data.url) {
    return NextResponse.redirect(`${appUrl}/homefolk.html?auth_error=1`)
  }

  return NextResponse.redirect(data.url)
}
