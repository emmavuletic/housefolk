import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { resend, FROM_EMAIL } from '@/lib/resend'

// Strip quoted reply text — everything after the first quoted block
function extractReplyText(text: string): string {
  if (!text) return ''
  // Remove lines starting with > (quoted), and everything after "On ... wrote:" patterns
  const lines = text.split('\n')
  const result: string[] = []
  for (const line of lines) {
    if (line.startsWith('>')) break
    if (/^On .+ wrote:/.test(line.trim())) break
    if (line.includes('---------- Original message ----------')) break
    if (line.includes('________________________________')) break
    result.push(line)
  }
  return result.join('\n').trim()
}

// POST /api/email/inbound — Resend inbound webhook
export async function POST(req: NextRequest) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  const sig = req.headers.get('x-resend-signature') || req.headers.get('authorization')
  if (sig !== secret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const payload = await req.json()

  // Resend inbound payload shape: { from, to, subject, text, html }
  const toAddresses: string[] = Array.isArray(payload.to) ? payload.to : [payload.to]
  const fromAddress: string = Array.isArray(payload.from) ? payload.from[0] : payload.from

  // Find the reply+{enquiryId}@inbound.housefolk.co address
  const replyAddr = toAddresses.find(a => a.includes('reply+'))
  if (!replyAddr) return NextResponse.json({ ok: true }) // not a tracked reply

  const match = replyAddr.match(/reply\+([a-f0-9-]{36})@/)
  if (!match) return NextResponse.json({ ok: true })
  const enquiryId = match[1]

  // Extract sender email (strip name if present e.g. "Name <email@x.com>")
  const senderEmail = (fromAddress.match(/<(.+)>/) || [, fromAddress])[1]?.trim()
  if (!senderEmail) return NextResponse.json({ ok: true })

  const supabase = createServerClient()

  // Look up the enquiry
  const { data: enquiry } = await supabase
    .from('enquiries')
    .select(`
      id, tenant_id, landlord_id,
      listing:listings!enquiries_listing_id_fkey(id, title),
      tenant:users!enquiries_tenant_id_fkey(id, first_name, last_name, email),
      landlord:users!enquiries_landlord_id_fkey(id, first_name, last_name, email)
    `)
    .eq('id', enquiryId)
    .single()

  if (!enquiry) return NextResponse.json({ ok: true })

  // Match sender to a participant
  const tenant = enquiry.tenant as unknown as { id: string; first_name: string; last_name: string; email: string }
  const landlord = enquiry.landlord as unknown as { id: string; first_name: string; last_name: string; email: string }

  let senderId: string | null = null
  let recipient: { id: string; first_name: string; email: string } | null = null

  if (tenant?.email?.toLowerCase() === senderEmail.toLowerCase()) {
    senderId = tenant.id
    recipient = landlord
  } else if (landlord?.email?.toLowerCase() === senderEmail.toLowerCase()) {
    senderId = landlord.id
    recipient = tenant
  }

  if (!senderId || !recipient) return NextResponse.json({ ok: true }) // unknown sender

  // Extract clean reply body
  const rawText = payload.text || ''
  const body = extractReplyText(rawText)
  if (!body || body.length < 2) return NextResponse.json({ ok: true })
  const trimmedBody = body.slice(0, 2000)

  // Insert the message (best-effort — email still sends even if this fails)
  const { error: insertError } = await supabase
    .from('messages')
    .insert({ enquiry_id: enquiryId, sender_id: senderId, body: trimmedBody })

  if (insertError) {
    console.error('[inbound] insert error:', insertError.message)
    // Continue anyway — still forward the reply email to recipient
  }

  // Notify the recipient by email
  const senderName = senderId === tenant.id
    ? `${tenant.first_name} ${tenant.last_name}`.trim()
    : `${landlord.first_name} ${landlord.last_name}`.trim()
  const listingTitle = (enquiry.listing as unknown as { title: string } | null)?.title ?? 'your listing'
  const replyTo = `reply+${enquiryId}@inbound.housefolk.co`

  if (recipient.email) {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: recipient.email,
      reply_to: replyTo,
      subject: `New message from ${senderName} on Housefolk`,
      html: `
        <p>Hi ${recipient.first_name},</p>
        <p><strong>${senderName}</strong> replied to your conversation about <strong>${listingTitle}</strong>.</p>
        <blockquote style="border-left:3px solid #ccc;padding-left:1rem;color:#555">${trimmedBody.replace(/\n/g, '<br>')}</blockquote>
        <p>Reply to this email to respond, or <a href="https://app.housefolk.co">view in your Housefolk account</a>.</p>
        <p>— The Housefolk team</p>
      `,
    })
  }

  return NextResponse.json({ ok: true })
}
