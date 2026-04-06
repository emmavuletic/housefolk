import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const token = auth.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Invalid token.' }, { status: 401 })

  const blockedId = params.id
  if (blockedId === user.id) return NextResponse.json({ error: 'Cannot block yourself.' }, { status: 400 })

  const { error } = await supabase.from('user_blocks').upsert(
    { blocker_id: user.id, blocked_id: blockedId },
    { onConflict: 'blocker_id,blocked_id' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
