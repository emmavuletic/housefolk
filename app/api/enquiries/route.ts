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

interface ProfileData {
  first_name?: string | null
  last_name?: string | null
  star_sign?: string | null
  bio?: string | null
  instagram?: string | null
  linkedin?: string | null
  job_title?: string | null
  company?: string | null
  daily_schedule?: string | null
  avatar_url?: string | null
}

function buildEnquiryEmail({
  recipientFirstName,
  intro,
  message,
  profile,
  replyId,
}: {
  recipientFirstName: string | null | undefined
  intro: string
  message: string
  profile: ProfileData | null
  replyId: string
}): string {
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).map(s => escapeHtml(s!)).join(' ')
  const jobLine = [profile?.job_title, profile?.company].filter(Boolean).map(s => escapeHtml(s!)).join(' at ')
  const avatarInitials = [profile?.first_name?.[0], profile?.last_name?.[0]].filter(Boolean).join('').toUpperCase()

  const avatarHtml = profile?.avatar_url
    ? `<img src="${escapeHtml(profile.avatar_url)}" alt="${name}" width="56" height="56" style="width:56px;height:56px;border-radius:50%;object-fit:cover;display:block">`
    : `<div style="width:56px;height:56px;border-radius:50%;background:#E8E0D5;display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:600;color:#5C4A32;line-height:56px;text-align:center">${escapeHtml(avatarInitials)}</div>`

  const socialLinks: string[] = []
  const igUrl = profile?.instagram ? safeUrl(profile.instagram.startsWith('http') ? profile.instagram : `https://instagram.com/${profile.instagram}`) : null
  const liUrl = profile?.linkedin ? safeUrl(profile.linkedin.startsWith('http') ? profile.linkedin : `https://linkedin.com/in/${profile.linkedin}`) : null
  if (igUrl) socialLinks.push(`<a href="${escapeHtml(igUrl)}" style="color:#C13584;text-decoration:none;margin-right:12px">Instagram</a>`)
  if (liUrl) socialLinks.push(`<a href="${escapeHtml(liUrl)}" style="color:#0077B5;text-decoration:none">LinkedIn</a>`)

  const scheduleLabel: Record<string, string> = {
    early_bird: '🌅 Early bird',
    night_owl: '🦉 Night owl',
    flexible: '☀️ Flexible',
  }

  const replyUrl = `https://app.housefolk.co/housefolk.html?inbox=${replyId}`

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F0EA;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0EA;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">

        <!-- Header -->
        <tr><td style="padding-bottom:20px;text-align:center">
          <span style="font-size:1.1rem;font-weight:700;color:#3D2B1A;letter-spacing:0.5px">housefolk</span>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#FFFFFF;border-radius:12px;padding:32px;border:1px solid #E8E0D5">

          <!-- Intro -->
          <p style="margin:0 0 24px;font-size:0.95rem;color:#3D2B1A;line-height:1.5">
            Hi ${escapeHtml(recipientFirstName || '')}! ${intro}
          </p>

          <!-- Profile header -->
          <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #F0E8DF;border-radius:10px;overflow:hidden;width:100%">
            <tr>
              <td style="padding:16px 20px;background:#FDFAF7;vertical-align:top;width:72px">
                ${avatarHtml}
              </td>
              <td style="padding:16px 20px 16px 0;vertical-align:top">
                <p style="margin:0 0 2px;font-size:1rem;font-weight:700;color:#3D2B1A">${name}</p>
                ${jobLine ? `<p style="margin:0 0 6px;font-size:0.82rem;color:#7A6452">${jobLine}</p>` : ''}
                ${profile?.star_sign ? `<p style="margin:0 0 6px;font-size:0.82rem;color:#A08060">☽ ${escapeHtml(profile.star_sign)}</p>` : ''}
                ${profile?.daily_schedule && scheduleLabel[profile.daily_schedule] ? `<p style="margin:0 0 6px;font-size:0.82rem;color:#A08060">${scheduleLabel[profile.daily_schedule]}</p>` : ''}
                ${socialLinks.length ? `<p style="margin:0;font-size:0.82rem">${socialLinks.join('')}</p>` : ''}
              </td>
            </tr>
            ${profile?.bio ? `
            <tr>
              <td colspan="2" style="padding:0 20px 16px 20px;border-top:1px solid #F0E8DF">
                <p style="margin:12px 0 0;font-size:0.83rem;color:#5C4A32;line-height:1.55">${escapeHtml(profile.bio)}</p>
              </td>
            </tr>` : ''}
          </table>

          <!-- Message -->
          <p style="margin:0 0 8px;font-size:0.78rem;font-weight:600;color:#A08060;text-transform:uppercase;letter-spacing:0.6px">Their message</p>
          <blockquote style="margin:0 0 28px;padding:14px 18px;background:#F9F5F0;border-left:3px solid #C9A97A;border-radius:0 6px 6px 0;font-size:0.9rem;color:#3D2B1A;line-height:1.6">
            ${escapeHtml(message)}
          </blockquote>

          <!-- CTA -->
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="${escapeHtml(replyUrl)}" style="display:inline-block;background:#3D2B1A;color:#FFFFFF;text-decoration:none;font-size:0.88rem;font-weight:600;padding:12px 24px;border-radius:7px">
              Reply on Housefolk →
            </a>
          </td></tr></table>

          <p style="margin:20px 0 0;font-size:0.78rem;color:#A09080;line-height:1.4">
            Or reply directly to this email — your email address won't be shared with the other person.
          </p>

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 0;text-align:center;font-size:0.75rem;color:#B0A090">
          © Housefolk · <a href="https://www.housefolk.co" style="color:#B0A090">housefolk.co</a>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
  `.trim()
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
    tenant:users!enquiries_tenant_id_fkey(id, first_name, last_name, bio, star_sign, job_title, company, instagram, linkedin, avatar_url),
    landlord:users!enquiries_landlord_id_fkey(id, first_name, last_name, viewing_url, bio, star_sign, job_title, company, instagram, linkedin, avatar_url)
  `

  // Fetch both sides in parallel — enquiries sent by user (as tenant) and received (as landlord)
  const [sentRes, receivedRes] = await Promise.all([
    supabase.from('enquiries').select(select).eq('tenant_id', user.id).order('created_at', { ascending: false }),
    supabase.from('enquiries').select(select).eq('landlord_id', user.id).order('created_at', { ascending: false }),
  ])

  if (sentRes.error) return NextResponse.json({ error: sentRes.error.message }, { status: 500 })
  if (receivedRes.error) return NextResponse.json({ error: receivedRes.error.message }, { status: 500 })

  const sent = sentRes.data ?? []
  const received = receivedRes.data ?? []
  const allIds = [...sent, ...received].map(e => e.id)

  // Fetch the latest message per enquiry so the conversation list can show a live preview
  const lastMsgMap: Record<string, { body: string; created_at: string; sender_id: string }> = {}
  if (allIds.length > 0) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('enquiry_id, body, created_at, sender_id')
      .in('enquiry_id', allIds)
      .order('created_at', { ascending: false })
    for (const m of msgs ?? []) {
      if (!lastMsgMap[m.enquiry_id]) lastMsgMap[m.enquiry_id] = m
    }
  }

  const attach = (e: any) => ({ ...e, last_message: lastMsgMap[e.id] ?? null })

  return NextResponse.json({
    sent: sent.map(attach),
    received: received.map(attach),
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
    .select('first_name, last_name, star_sign, bio, instagram, linkedin, job_title, company, daily_schedule, avatar_url')
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
      await resend.emails.send({
        from: FROM_EMAIL,
        to: recipientData.email,
        reply_to: `reply+${enquiry.id}@inbound.housefolk.co`,
        subject: `${senderName} wants to connect on Housefolk`,
        html: buildEnquiryEmail({
          recipientFirstName: recipientData.first_name,
          intro: `<strong>${escapeHtml(senderName)}</strong> wants to connect with you on Housefolk.`,
          message: message.trim(),
          profile,
          replyId: enquiry.id,
        }),
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

  if (!landlordData?.email) {
    console.error('[enquiries POST] No landlord email found for landlord_id:', listing.landlord_id)
  }
  if (landlordData?.email) {
    const tenantName = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()
    console.log('[enquiries POST] Sending email to:', landlordData.email, 'from:', FROM_EMAIL)
    const emailResult = await resend.emails.send({
      from: FROM_EMAIL,
      to: landlordData.email,
      reply_to: `reply+${enquiry.id}@inbound.housefolk.co`,
      subject: `New enquiry from ${tenantName} — ${listing.title}`,
      html: buildEnquiryEmail({
        recipientFirstName: landlordData.first_name,
        intro: `You have a new enquiry about your listing <strong>${escapeHtml(listing.title)}</strong>.`,
        message: message.trim(),
        profile,
        replyId: enquiry.id,
      }),
    })
    if (emailResult.error) {
      console.error('[enquiries POST] Resend error:', emailResult.error)
    } else {
      console.log('[enquiries POST] Email sent, id:', emailResult.data?.id)
    }
  }

  return NextResponse.json({ enquiry }, { status: 201 })
}
