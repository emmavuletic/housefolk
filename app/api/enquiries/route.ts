import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { rateLimit } from '@/lib/rate-limit'

function escapeHtml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function safeUrl(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch { return null }
}

// GET /api/enquiries — get enquiries for logged-in user (landlord or tenant)
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const token = auth.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Invalid token.' }, { status: 401 })

  const select = `
    id, message, read, created_at, tenant_id, landlord_id,
    listing:listings(id, title, type, location),
    tenant:users!enquiries_tenant_id_fkey(id, first_name, last_name),
    landlord:users!enquiries_landlord_id_fkey(id, first_name, last_name, viewing_url)
  `

  // Fetch both sides in parallel — enquiries sent by user (as tenant) and received (as landlord)
  const [sentRes, receivedRes] = await Promise.all([
    supabase.from('enquiries').select(select).eq('tenant_id', user.id).order('created_at', { ascending: false }),
    supabase.from('enquiries').select(select).eq('landlord_id', user.id).order('created_at', { ascending: false }),
  ])

  if (sentRes.error) return NextResponse.json({ error: sentRes.error.message }, { status: 500 })
  if (receivedRes.error) return NextResponse.json({ error: receivedRes.error.message }, { status: 500 })

  return NextResponse.json({
    sent: sentRes.data ?? [],
    received: receivedRes.data ?? [],
  })
}

// POST /api/enquiries — tenant sends a message to landlord
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  if (!rateLimit(`enquiry:${ip}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many messages. Please wait before sending again.' }, { status: 429 })
  }

  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const token = auth.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Invalid token.' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('first_name, last_name, star_sign, bio, instagram, linkedin, job_title, company')
    .eq('id', user.id)
    .single()

  const { listing_id, message, recipient_id, enquiry_type } = await req.json()
  if (!message?.trim()) {
    return NextResponse.json({ error: 'message required.' }, { status: 400 })
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: 'Message too long (max 2000 characters).' }, { status: 400 })
  }

  const isRoommate = enquiry_type === 'roommate'

  if (isRoommate) {
    if (!recipient_id) return NextResponse.json({ error: 'recipient_id required for roommate messages.' }, { status: 400 })

    const { data: recipientData } = await supabase
      .from('users')
      .select('id, email, first_name')
      .eq('id', recipient_id)
      .single()

    if (!recipientData) return NextResponse.json({ error: 'Recipient not found.' }, { status: 404 })

    const { data: enquiry, error } = await supabase.from('enquiries').insert({
      tenant_id: user.id,
      landlord_id: recipient_id,
      listing_id: null,
      enquiry_type: 'roommate',
      message: message.trim(),
      read: false,
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (recipientData.email) {
      const senderName = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()
      const profileLines: string[] = []
      if (profile?.star_sign) profileLines.push(`⭐ Star sign: ${profile.star_sign.charAt(0).toUpperCase() + profile.star_sign.slice(1)}`)
      if (profile?.bio) profileLines.push(`💬 About them: ${profile.bio}`)
      if (profile?.job_title) profileLines.push(`💼 ${profile.job_title}${profile.company ? ` at ${profile.company}` : ''}`)
      const igUrl = profile?.instagram ? safeUrl(profile.instagram) : null
      const liUrl = profile?.linkedin ? safeUrl(profile.linkedin) : null
      if (igUrl && profile) profileLines.push(`📸 Instagram: <a href="${igUrl}">${escapeHtml(profile.instagram)}</a>`)
      if (liUrl && profile) profileLines.push(`🔗 LinkedIn: <a href="${liUrl}">${escapeHtml(profile.linkedin)}</a>`)
      const profileHtml = profileLines.length > 0
        ? `<p style="margin-top:1.2rem;font-size:0.9rem;color:#888;border-top:1px solid #eee;padding-top:1rem"><strong>Their profile</strong><br>${profileLines.join('<br>')}</p>`
        : ''
      await resend.emails.send({
        from: FROM_EMAIL,
        to: recipientData.email,
        reply_to: `reply+${enquiry.id}@inbound.housefolk.co`,
        subject: `Someone wants to connect on Housefolk`,
        html: `
          <p>Hi ${recipientData.first_name},</p>
          <p><strong>${senderName}</strong> wants to connect with you on Housefolk.</p>
          <blockquote style="border-left:3px solid #ccc;padding-left:1rem;color:#555">${escapeHtml(message.trim())}</blockquote>
          ${profileHtml}
          <p style="margin-top:1.2rem">Reply to this email to respond, or <a href="https://app.housefolk.co">view in your Housefolk account</a>.</p>
          <p>— The Housefolk team</p>
        `,
      })
    }

    return NextResponse.json({ enquiry }, { status: 201 })
  }

  // Listing enquiry (default path)
  if (!listing_id) {
    return NextResponse.json({ error: 'listing_id required.' }, { status: 400 })
  }

  const { data: listing } = await supabase
    .from('listings')
    .select('id, title, landlord_id')
    .eq('id', listing_id)
    .single()

  if (!listing) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })

  // Block duplicate enquiries from same tenant on same listing
  const { data: existing } = await supabase
    .from('enquiries')
    .select('id')
    .eq('tenant_id', user.id)
    .eq('listing_id', listing_id)
    .single()
  if (existing) return NextResponse.json({ error: 'You have already sent an enquiry for this listing.' }, { status: 409 })

  // Fetch landlord separately — more reliable than embed syntax
  const { data: landlordData } = await supabase
    .from('users')
    .select('email, first_name')
    .eq('id', listing.landlord_id)
    .single()

  const { data: enquiry, error } = await supabase.from('enquiries').insert({
    tenant_id: user.id,
    landlord_id: listing.landlord_id,
    listing_id,
    enquiry_type: 'listing',
    message: message.trim(),
    read: false,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Email landlord with renter profile
  if (!landlordData?.email) {
    console.error('[enquiries POST] No landlord email found for landlord_id:', listing.landlord_id)
  }
  if (landlordData?.email) {
    const tenantName = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()
    const profileLines: string[] = []
    if (profile?.star_sign) profileLines.push(`⭐ Star sign: ${profile.star_sign.charAt(0).toUpperCase() + profile.star_sign.slice(1)}`)
    if (profile?.bio) profileLines.push(`💬 About them: ${profile.bio}`)
    if (profile?.job_title) profileLines.push(`💼 ${profile.job_title}${profile.company ? ` at ${profile.company}` : ''}`)
    if (profile?.instagram) profileLines.push(`📸 Instagram: <a href="${profile.instagram}">${profile.instagram}</a>`)
    if (profile?.linkedin) profileLines.push(`🔗 LinkedIn: <a href="${profile.linkedin}">${profile.linkedin}</a>`)
    const profileHtml = profileLines.length > 0
      ? `<p style="margin-top:1.2rem;font-size:0.9rem;color:#888;border-top:1px solid #eee;padding-top:1rem"><strong>Renter profile</strong><br>${profileLines.join('<br>')}</p>`
      : ''
    console.log('[enquiries POST] Sending email to:', landlordData.email, 'from:', FROM_EMAIL)
    const emailResult = await resend.emails.send({
      from: FROM_EMAIL,
      to: landlordData.email,
      reply_to: `reply+${enquiry.id}@inbound.housefolk.co`,
      subject: `New enquiry on your Housefolk listing: ${listing.title}`,
      html: `
        <p>Hi ${landlordData.first_name},</p>
        <p>You have a new enquiry from <strong>${tenantName}</strong> about your listing <strong>${listing.title}</strong>.</p>
        <blockquote style="border-left:3px solid #ccc;padding-left:1rem;color:#555">${escapeHtml(message.trim())}</blockquote>
        ${profileHtml}
        <p style="margin-top:1.2rem">Reply to this email to respond, or <a href="https://app.housefolk.co">view in your Housefolk account</a>.</p>
        <p>— The Housefolk team</p>
      `,
    })
    if (emailResult.error) {
      console.error('[enquiries POST] Resend error:', emailResult.error)
    } else {
      console.log('[enquiries POST] Email sent, id:', emailResult.data?.id)
    }
  }

  return NextResponse.json({ enquiry }, { status: 201 })
}
