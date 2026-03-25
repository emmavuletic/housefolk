import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { rateLimit } from '@/lib/rate-limit'

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
    .select('first_name, last_name')
    .eq('id', user.id)
    .single()

  const { listing_id, message } = await req.json()
  if (!listing_id || !message?.trim()) {
    return NextResponse.json({ error: 'listing_id and message required.' }, { status: 400 })
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: 'Message too long (max 2000 characters).' }, { status: 400 })
  }

  const { data: listing } = await supabase
    .from('listings')
    .select('id, title, landlord_id, users(email, first_name)')
    .eq('id', listing_id)
    .single()

  if (!listing) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })

  const { data: enquiry, error } = await supabase.from('enquiries').insert({
    tenant_id: user.id,
    landlord_id: listing.landlord_id,
    listing_id,
    message: message.trim(),
    read: false,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Email landlord — no contact details shown
  const landlordData = (listing.users as unknown as { email: string; first_name: string }[] | null)?.[0] ?? null
  if (landlordData?.email) {
    const tenantName = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()
    await resend.emails.send({
      from: FROM_EMAIL,
      to: landlordData.email,
      subject: `New enquiry on your Housefolk listing: ${listing.title}`,
      html: `
        <p>Hi ${landlordData.first_name},</p>
        <p>You have a new enquiry from <strong>${tenantName}</strong> about your listing <strong>${listing.title}</strong>.</p>
        <blockquote style="border-left:3px solid #ccc;padding-left:1rem;color:#555">${message.trim()}</blockquote>
        <p>Reply to them via your <a href="${process.env.NEXT_PUBLIC_APP_URL}">Housefolk dashboard</a>. Contact details are never shared directly.</p>
        <p>— The Housefolk team</p>
      `,
    })
  }

  return NextResponse.json({ enquiry }, { status: 201 })
}
