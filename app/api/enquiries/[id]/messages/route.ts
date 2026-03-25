import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { resend, FROM_EMAIL } from '@/lib/resend'

async function getAuthedUser(req: NextRequest) {
  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return { supabase, user: null, profile: null }
  const token = auth.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return { supabase, user: null, profile: null }
  const { data: profile } = await supabase.from('users').select('id, first_name, last_name, email, role').eq('id', user.id).single()
  return { supabase, user, profile }
}

// GET /api/enquiries/[id]/messages — fetch all messages for a conversation
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, user } = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  // Verify user is part of this enquiry
  const { data: enquiry } = await supabase
    .from('enquiries')
    .select('id, tenant_id, landlord_id')
    .eq('id', params.id)
    .single()

  if (!enquiry) return NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 })
  if (enquiry.tenant_id !== user.id && enquiry.landlord_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, body, created_at, sender_id, sender:users!messages_sender_id_fkey(id, first_name, last_name)')
    .eq('enquiry_id', params.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ messages: [] }) // table may not exist yet
  return NextResponse.json({ messages })
}

// POST /api/enquiries/[id]/messages — send a reply in a conversation
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, user, profile } = await getAuthedUser(req)
  if (!user || !profile) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const { data: enquiry } = await supabase
    .from('enquiries')
    .select(`
      id, tenant_id, landlord_id,
      listing:listings!enquiries_listing_id_fkey(id, title),
      tenant:users!enquiries_tenant_id_fkey(id, first_name, last_name, email),
      landlord:users!enquiries_landlord_id_fkey(id, first_name, last_name, email)
    `)
    .eq('id', params.id)
    .single()

  if (!enquiry) return NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 })
  if (enquiry.tenant_id !== user.id && enquiry.landlord_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const { body } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: 'Message body required.' }, { status: 400 })
  if (body.length > 2000) return NextResponse.json({ error: 'Message too long (max 2000 characters).' }, { status: 400 })

  const { data: message, error } = await supabase
    .from('messages')
    .insert({ enquiry_id: params.id, sender_id: user.id, body: body.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Email the other party
  const isLandlord = enquiry.landlord_id === user.id
  const recipient = isLandlord
    ? (enquiry.tenant as unknown as { email: string; first_name: string })
    : (enquiry.landlord as unknown as { email: string; first_name: string })
  const senderName = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
  const listingTitle = (enquiry.listing as unknown as { title: string } | null)?.title ?? 'your listing'

  if (recipient?.email) {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: recipient.email,
      subject: `New message from ${senderName} on Housefolk`,
      html: `
        <p>Hi ${recipient.first_name},</p>
        <p><strong>${senderName}</strong> sent you a message about <strong>${listingTitle}</strong>.</p>
        <blockquote style="border-left:3px solid #ccc;padding-left:1rem;color:#555">${body.trim()}</blockquote>
        <p>Reply via your <a href="${process.env.NEXT_PUBLIC_APP_URL}">Housefolk dashboard</a>.</p>
        <p>— The Housefolk team</p>
      `,
    })
  }

  return NextResponse.json({ message }, { status: 201 })
}
