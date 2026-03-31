import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// POST /api/users/me/avatar — upload a profile photo
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const token = auth.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Invalid token.' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `avatars/${user.id}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

  await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', user.id)

  return NextResponse.json({ avatar_url: publicUrl })
}
