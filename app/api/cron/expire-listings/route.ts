import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// GET /api/cron/expire-listings
// Runs hourly via Vercel Cron. Expires listings whose access_expires_at has passed.
// Protected by CRON_SECRET (set in Vercel environment variables).
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const supabase = createServerClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('listings')
    .update({
      status: 'expired',
      expired_at: now,
    })
    .eq('status', 'active')
    .lt('access_expires_at', now)
    .select('id')

  if (error) {
    console.error('[cron/expire-listings]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`[cron/expire-listings] Expired ${data?.length ?? 0} listings`)
  return NextResponse.json({ expired: data?.length ?? 0 })
}
