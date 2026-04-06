import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const token = auth.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Invalid token.' }, { status: 401 })

  const reportedId = params.id
  if (reportedId === user.id) return NextResponse.json({ error: 'Cannot report yourself.' }, { status: 400 })

  const { reason, detail, enquiry_id } = await req.json()
  if (!reason) return NextResponse.json({ error: 'Reason required.' }, { status: 400 })

  const ALLOWED_REASONS = ['harassment', 'inappropriate', 'scam', 'spam', 'other']
  if (!ALLOWED_REASONS.includes(reason)) return NextResponse.json({ error: 'Invalid reason.' }, { status: 400 })

  const { error } = await supabase.from('user_reports').insert({
    reporter_id: user.id,
    reported_id: reportedId,
    enquiry_id: enquiry_id || null,
    reason,
    detail: detail ? String(detail).slice(0, 500) : null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
