import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const token = auth.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: 'Invalid token.' }, { status: 401 })

  let { data: profile } = await supabase
    .from('users')
    .select('id, first_name, last_name, role, stripe_customer_id')
    .eq('id', user.id)
    .single()

  // Create profile if it doesn't exist (first Google sign-in)
  if (!profile) {
    const firstName = user.user_metadata?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'User'
    const lastName = user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || ''
    const { data: newProfile } = await supabase.from('users').insert({
      id: user.id,
      email: user.email,
      first_name: firstName,
      last_name: lastName,
      role: 'tenant',
    }).select('id, first_name, last_name, role, stripe_customer_id').single()
    profile = newProfile
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      ...profile,
    },
  })
}
