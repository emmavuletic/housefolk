import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { resend, FROM_EMAIL } from '@/lib/resend'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

async function moderateMessage(text: string): Promise<{ blocked: boolean; reason?: string }> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: `You are a content moderator for a UK housing platform. Review this message and reply with only "OK" if it is acceptable, or "BLOCK: <brief reason>" if it contains obscenities, sexual content, threats, harassment, or hate speech. Message: """${text}"""`,
      }],
    })
    const result = (response.content[0] as { text: string }).text.trim()
    if (result.startsWith('BLOCK:')) {
      return { blocked: true, reason: result.replace('BLOCK:', '').trim() }
    }
    return { blocked: false }
  } catch {
    return { blocked: false } // fail open — don't block messages if AI is unavailable
  }
}

function escapeHtml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

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

  // Mark as read when the user opens the thread
  await supabase.from('enquiries').update({ read: true }).eq('id', params.id)

  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, body, created_at, sender_id, sender:users!messages_sender_id_fkey(id, first_name, last_name)')
    .eq('enquiry_id', params.id)
    .order('created_at', { ascending: true })

  if (error) { console.error('[messages GET] DB error:', error.message); return NextResponse.json({ messages: [] }) }
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

  // Check if either party has blocked the other
  const otherId = enquiry.tenant_id === user.id ? enquiry.landlord_id : enquiry.tenant_id
  const { data: block } = await supabase
    .from('user_blocks')
    .select('id')
    .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${otherId}),and(blocker_id.eq.${otherId},blocked_id.eq.${user.id})`)
    .maybeSingle()
  if (block) return NextResponse.json({ error: 'You cannot send messages in this conversation.' }, { status: 403 })

  const { body } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: 'Message body required.' }, { status: 400 })
  if (body.length > 1000) return NextResponse.json({ error: 'Message too long (max 1000 characters).' }, { status: 400 })

  const moderation = await moderateMessage(body.trim())
  if (moderation.blocked) {
    return NextResponse.json({ error: 'Your message was not sent — it contains content that isn\'t allowed on Housefolk.' }, { status: 400 })
  }

  const { data: message, error } = await supabase
    .from('messages')
    .insert({ enquiry_id: params.id, sender_id: user.id, body: body.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Determine who the recipient is
  const isLandlord = enquiry.landlord_id === user.id
  const recipientId = isLandlord ? enquiry.tenant_id : enquiry.landlord_id
  const senderName = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
  const listingTitle = (enquiry.listing as unknown as { title: string } | null)?.title ?? 'your listing'

  // Mark conversation as unread for the recipient (reliable read tracking)
  await supabase.from('enquiries').update({ read: false }).eq('id', params.id)

  // Fetch recipient email directly — more reliable than FK join which can silently return null
  const { data: recipientUser } = await supabase
    .from('users')
    .select('email, first_name')
    .eq('id', recipientId)
    .single()

  if (recipientUser?.email) {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: recipientUser.email,
      reply_to: `reply+${params.id}@inbound.housefolk.co`,
      subject: `New message from ${senderName} on Housefolk`,
      html: `
        <p>Hi ${escapeHtml(recipientUser.first_name || '')},</p>
        <p><strong>${escapeHtml(senderName)}</strong> sent you a message about <strong>${escapeHtml(listingTitle)}</strong>.</p>
        <blockquote style="border-left:3px solid #ccc;padding-left:1rem;color:#555">${escapeHtml(body.trim())}</blockquote>
        <p>Reply to this email to respond, or <a href="https://app.housefolk.co">view in your Housefolk account</a>.</p>
        <p>— The Housefolk team</p>
      `,
    })
  } else {
    console.error('[messages POST] Could not find recipient email for user id:', recipientId)
  }

  return NextResponse.json({ message }, { status: 201 })
}
