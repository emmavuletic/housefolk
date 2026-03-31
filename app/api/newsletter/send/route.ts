import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { resend, FROM_EMAIL } from '@/lib/resend'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim())

// POST /api/newsletter/send — admin only, sends Thursday newsletter
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const auth = req.headers.get('authorization')
  if (!auth) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const token = auth.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Invalid token.' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('role, email').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin' || ADMIN_EMAILS.includes(profile?.email || '')
  if (!isAdmin) return NextResponse.json({ error: 'Admin only.' }, { status: 403 })

  const { subject, intro, listing_ids } = await req.json()
  if (!subject || !intro) {
    return NextResponse.json({ error: 'Subject and intro required.' }, { status: 400 })
  }

  // Fetch active listings for newsletter
  let listingsQuery = supabase
    .from('listings')
    .select('id, type, title, location, price, beds, bills_included')
    .eq('status', 'active')
    .eq('newsletter_included', true)
    .order('goes_live_at', { ascending: false })
    .limit(20)

  if (listing_ids?.length) {
    listingsQuery = listingsQuery.in('id', listing_ids)
  }

  const { data: listings } = await listingsQuery

  // Fetch active subscribers
  const { data: subscribers } = await supabase
    .from('subscribers')
    .select('email, name')
    .eq('active', true)

  if (!subscribers?.length) {
    return NextResponse.json({ error: 'No active subscribers.' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.housefolk.co'
  const typeIcon: Record<string, string> = { flatshare: '🏠', rental: '🏢', sublet: '🌿' }

  const listingsHtml = listings?.map(l => {
    const priceStr = l.price ? `£${Math.round(l.price / 100).toLocaleString()}/mo` : 'Free sublet'
    return `
      <a href="${appUrl}/listings/${l.id}" style="text-decoration:none;display:block;margin-bottom:0.7rem">
        <div style="background:#fff;border:1px solid #E2D9CE;border-radius:12px;padding:0.9rem;display:flex;gap:1rem;align-items:center">
          <span style="font-size:1.8rem;flex-shrink:0">${typeIcon[l.type] || '🏠'}</span>
          <div style="flex:1">
            <div style="font-weight:600;font-size:0.87rem;margin-bottom:0.15rem;color:#1A1510">${l.title}</div>
            <div style="font-size:0.75rem;color:#5A4F45">📍 ${l.location} · ${l.beds || '?'} bed · ${l.bills_included ? 'Bills incl.' : 'Bills excl.'}</div>
          </div>
          <span style="font-family:Georgia,serif;font-size:1.05rem;font-weight:700;color:#C8622A;flex-shrink:0">${priceStr}</span>
        </div>
      </a>`
  }).join('') || '<p style="color:#8A7E74">No listings this week.</p>'

  // Send in batches of 50 (Resend free tier limit)
  const BATCH_SIZE = 50
  let sent = 0

  for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
    const batch = subscribers.slice(i, i + BATCH_SIZE)

    await Promise.all(batch.map(sub => {
      const unsubUrl = `${appUrl}/api/subscribers/unsubscribe?email=${encodeURIComponent(sub.email)}`
      return resend.emails.send({
        from: FROM_EMAIL,
        to: sub.email,
        subject,
        html: `
          <div style="font-family:'DM Sans',sans-serif;max-width:600px;margin:0 auto;background:#FDF9F7">
            <div style="background:#1A1510;padding:0.9rem 2rem;display:flex;align-items:center;justify-content:space-between">
              <div style="font-family:Georgia,serif;font-size:1.2rem;font-weight:700;color:#FAF7F5">house<span style="color:#C8622A">folk</span></div>
              <span style="font-size:0.72rem;color:#7A6E62">Weekly listings</span>
            </div>
            <div style="padding:1.5rem 2rem;background:#FDF9F7">
              <div style="background:#fff;border:1px solid #E2D9CE;border-radius:12px;padding:1rem 1.2rem;margin-bottom:1.2rem;font-size:0.85rem;color:#5A4F45;line-height:1.65;font-style:italic">
                ${intro.replace(/\n/g, '<br>')}
              </div>
              <div style="font-family:Georgia,serif;font-size:1.1rem;margin-bottom:0.8rem;color:#1A1510">🏠 This week's new listings</div>
              ${listingsHtml}
              <div style="text-align:center;margin-top:1.2rem">
                <a href="${appUrl}/browse" style="display:inline-block;background:#1A1510;color:#fff;padding:0.7rem 2rem;border-radius:50px;text-decoration:none;font-weight:600;font-size:0.9rem">View all listings →</a>
              </div>
            </div>
            <div style="background:#1A1510;padding:1rem 2rem;font-size:0.72rem;color:#5A5048;text-align:center">
              <p>Housefolk · You're receiving this because you subscribed</p>
              <p style="margin-top:0.4rem"><a href="${unsubUrl}" style="color:#8896A5">Unsubscribe</a></p>
            </div>
          </div>
        `,
      })
    }))

    sent += batch.length
  }

  // Log newsletter issue
  await supabase.from('newsletter_issues').insert({
    subject,
    intro,
    status: 'sent',
    sent_at: new Date().toISOString(),
    sent_count: sent,
  })

  return NextResponse.json({ success: true, sent })
}
