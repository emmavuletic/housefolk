'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'

interface Listing {
  id: string
  type: string
  title: string
  location: string
  price: number | null
  beds: number | null
  baths: number | null
  bills_included: boolean
  furnished: boolean | null
  pet_friendly: boolean | null
  description: string | null
  motto: string | null
  available_date: string | null
  sublet_until: string | null
  photos: string[]
  spotify_url: string | null
  instagram: string | null
  linkedin: string | null
  airbnb: string | null
  star_signs: string[]
  music_vibes: string[]
  featured?: boolean
}

const STAR_SIGN_EMOJI: Record<string, string> = {
  aries: '♈', taurus: '♉', gemini: '♊', cancer: '♋', leo: '♌', virgo: '♍',
  libra: '♎', scorpio: '♏', sagittarius: '♐', capricorn: '♑', aquarius: '♒', pisces: '♓',
}

const MUSIC_VIBE_EMOJI: Record<string, string> = {
  classical: '🎼', jazz: '🎷', binaural: '🧘', silence: '🤫', livejams: '🎸',
  indie: '🎤', hiphop: '🎧', electronic: '🎛️', folk: '🪕', pop: '🎶', world: '🌍', whatever: '🎲',
}

const TYPE_LABELS: Record<string, { emoji: string; label: string }> = {
  flatshare: { emoji: '🏠', label: 'Flatshare' },
  rental: { emoji: '🏢', label: 'Rental' },
  sublet: { emoji: '🌿', label: 'Sublet' },
}

function formatPrice(pence: number | null): string {
  if (!pence) return 'Free sublet'
  return `£${(pence / 100).toLocaleString('en-GB')}/mo`
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Flexible'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function ListingDetailPage({ params }: { params: { id: string } }) {
  const [listing, setListing] = useState<Listing | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [enquirySent, setEnquirySent] = useState(false)
  const [enquiryLoading, setEnquiryLoading] = useState(false)
  const [enquiryMessage, setEnquiryMessage] = useState('')
  const [saved, setSaved] = useState(false)
  const [carouselOpen, setCarouselOpen] = useState(false)
  const [carouselIndex, setCarouselIndex] = useState(0)

  function openCarousel(index: number) { setCarouselIndex(index); setCarouselOpen(true) }
  function closeCarousel() { setCarouselOpen(false) }
  function carouselPrev(total: number) { setCarouselIndex(i => (i - 1 + total) % total) }
  function carouselNext(total: number) { setCarouselIndex(i => (i + 1) % total) }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token
      if (!token) { window.location.href = '/housefolk.html'; return }

      fetch(`/api/listings/${params.id}`)
        .then(r => r.json())
        .then(({ listing: data }) => {
          if (!data) { setNotFound(true); return }
          setListing(data)
          fetch('/api/listings/saved', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(({ listings: saved }) => {
              setSaved((saved || []).some((l: { id: string }) => l.id === params.id))
            })
            .catch(() => {})
        })
        .catch(() => setNotFound(true))
    })
  }, [params.id])

  async function toggleSave() {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { window.location.href = '/housefolk.html'; return }
    if (saved) {
      await fetch(`/api/listings/${params.id}/save`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      setSaved(false)
    } else {
      await fetch(`/api/listings/${params.id}/save`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      setSaved(true)
    }
  }

  async function handleEnquiry() {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      window.location.href = '/housefolk.html'
      return
    }
    setEnquiryLoading(true)
    try {
      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ listing_id: params.id, message: enquiryMessage.trim() }),
      })
      const data = await res.json()
      if (res.ok && !data.error) {
        setEnquirySent(true)
      } else {
        alert(data.error || 'Failed to send message. Please try again.')
      }
    } catch {
      alert('Network error. Please try again.')
    } finally {
      setEnquiryLoading(false)
    }
  }

  if (notFound) {
    return (
      <>
        <style suppressHydrationWarning>{globalStyles}</style>
        <div style={styles.page}>
          <nav style={styles.nav}>
            <a href="/housefolk.html" style={styles.navLogo}>Housefolk</a>
          </nav>
          <div style={styles.notFound}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏚️</div>
            <h2 style={styles.notFoundTitle}>Listing not found</h2>
            <p style={styles.notFoundText}>This listing may have expired or been removed.</p>
            <a href="/listings" style={styles.backLink}>← Browse all listings</a>
          </div>
        </div>
      </>
    )
  }

  if (!listing) {
    return (
      <>
        <style suppressHydrationWarning>{globalStyles}</style>
        <div style={styles.page}>
          <nav style={styles.nav}>
            <a href="/housefolk.html" style={styles.navLogo}>Housefolk</a>
          </nav>
          <div style={styles.loadingWrap}>
            <div style={styles.spinner} />
          </div>
        </div>
      </>
    )
  }

  const typeInfo = TYPE_LABELS[listing.type] ?? { emoji: '🏠', label: listing.type }
  const photos = listing.photos?.length ? listing.photos : []

  return (
    <>
      <style suppressHydrationWarning>{globalStyles}</style>
      <div style={styles.page}>
        {/* Nav */}
        <nav style={styles.nav}>
          <a href="/housefolk.html" style={styles.navLogo}>Housefolk</a>
          <a href="/listings" style={styles.navBack}>← All listings</a>
          <a href="/housefolk.html" style={{ marginLeft: 'auto', background: '#1A1510', color: '#fff', padding: '0.6rem 1.2rem', borderRadius: '10px', fontWeight: 600, fontSize: '0.88rem', textDecoration: 'none' }}>My account →</a>
        </nav>

        <main style={styles.main}>
          {/* Motto + Collage row */}
          <div className="photo-motto-row">
            {/* Motto — desktop only left strip */}
            {listing.motto && (
              <div className="motto-strip" style={{ position: 'relative' }}>
                {/* Hand-drawn vintage key illustration — sits behind the quote */}
                <svg
                  viewBox="0 0 340 560"
                  width="320"
                  height="520"
                  style={{ position: 'absolute', top: '1rem', left: '50%', transform: 'translateX(-50%)', opacity: 0.11, zIndex: 0, pointerEvents: 'none' }}
                  fill="none"
                  stroke="#1A1510"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {/* ── MAIN STEM ── */}
                  <path d="M172 200 C170 222, 168 244, 166 266 C164 288, 162 310, 160 332 C158 354, 156 376, 155 400 C154 420, 153 442, 152 460" strokeWidth="4.5"/>

                  {/* ── MAIN FLOWER — head pointing left ── */}
                  {/* Centre */}
                  <path d="M148 190 C142 184, 134 182, 132 190 C130 198, 136 206, 144 206 C152 206, 158 200, 156 192 C154 184, 148 182, 146 190 Z" strokeWidth="3.5"/>
                  {/* Petal left (pointing left — main direction) */}
                  <path d="M134 194 C118 190, 100 186, 84 180 C68 174, 58 162, 70 156 C82 150, 102 162, 120 174 C132 182, 138 190, 136 196" strokeWidth="4"/>
                  {/* Petal far left */}
                  <path d="M132 188 C116 176, 96 160, 82 144 C68 128, 68 114, 80 118 C92 122, 108 142, 124 162 C134 174, 138 184, 134 190" strokeWidth="4"/>
                  {/* Petal top-left */}
                  <path d="M140 182 C136 166, 130 148, 126 130 C122 112, 128 98, 138 104 C148 110, 152 130, 152 150 C152 166, 148 180, 144 184" strokeWidth="4"/>
                  {/* Petal top */}
                  <path d="M150 180 C152 164, 156 146, 162 130 C168 114, 178 104, 184 112 C190 120, 184 138, 174 154 C166 166, 156 178, 150 182" strokeWidth="4"/>
                  {/* Petal top-right */}
                  <path d="M158 184 C166 170, 178 156, 192 146 C206 136, 218 136, 216 148 C214 160, 200 166, 184 172 C172 176, 162 182, 158 186" strokeWidth="4"/>
                  {/* Petal right */}
                  <path d="M158 192 C170 188, 186 186, 200 190 C214 194, 220 204, 210 210 C200 216, 184 212, 170 206 C160 202, 156 196, 158 194" strokeWidth="4"/>
                  {/* Petal bottom-right */}
                  <path d="M154 202 C162 214, 170 228, 168 244 C166 260, 156 266, 148 256 C140 246, 140 228, 144 212 C148 202, 152 200, 154 204" strokeWidth="4"/>
                  {/* Petal detail lines */}
                  <path d="M80 164 C90 170, 100 174, 110 178" strokeWidth="1.8" opacity="0.5"/>
                  <path d="M132 116 C136 126, 138 138, 140 148" strokeWidth="1.8" opacity="0.5"/>
                  <path d="M176 118 C172 130, 168 140, 164 150" strokeWidth="1.8" opacity="0.5"/>
                  <path d="M204 152 C196 158, 188 164, 180 168" strokeWidth="1.8" opacity="0.5"/>

                  {/* ── BRANCH LEFT with small flower ── */}
                  <path d="M164 280 C150 272, 132 266, 116 260 C100 254, 86 250, 76 244" strokeWidth="3.5"/>
                  {/* Small flower left — centre */}
                  <path d="M68 240 C64 236, 58 236, 58 242 C58 248, 64 252, 70 250 C76 248, 78 242, 74 238 C70 234, 66 236, 68 240 Z" strokeWidth="2.5"/>
                  {/* Small flower left petals */}
                  <path d="M60 240 C52 234, 44 226, 46 218 C48 210, 56 212, 62 220 C66 228, 64 236, 62 240" strokeWidth="3"/>
                  <path d="M64 236 C60 226, 60 214, 66 208 C72 202, 78 208, 76 218 C74 226, 70 234, 66 238" strokeWidth="3"/>
                  <path d="M72 236 C72 224, 76 212, 84 208 C92 204, 96 212, 90 220 C84 228, 76 234, 72 238" strokeWidth="3"/>
                  <path d="M74 242 C82 238, 92 236, 98 242 C92 248, 82 248, 74 244" strokeWidth="3"/>
                  <path d="M70 248 C66 256, 62 264, 64 272 C66 258, 70 254, 72 250" strokeWidth="3"/>

                  {/* ── BRANCH RIGHT with bud ── */}
                  <path d="M162 320 C174 312, 188 306, 202 302 C216 298, 228 298, 234 306" strokeWidth="3.5"/>
                  {/* Bud right */}
                  <path d="M234 306 C236 296, 240 284, 238 274 C236 264, 230 260, 226 268 C222 276, 224 292, 228 304" strokeWidth="3.5"/>
                  <path d="M234 306 C242 298, 250 288, 248 276 C246 264, 238 262, 234 270" strokeWidth="3"/>
                  {/* Bud tip */}
                  <path d="M236 272 C236 266, 234 262, 232 260" strokeWidth="2.5"/>

                  {/* ── LEAF cluster left on main stem ── */}
                  <path d="M166 356 C152 344, 134 336, 118 334 C130 346, 146 352, 164 358" strokeWidth="3.5"/>
                  <path d="M164 358 C154 358, 142 362, 130 370 C142 372, 156 368, 165 360" strokeWidth="3"/>
                  {/* Leaf veins */}
                  <path d="M166 358 C152 348, 140 342, 130 340" strokeWidth="1.5" opacity="0.5"/>
                  <path d="M164 360 C154 362, 144 366, 136 370" strokeWidth="1.5" opacity="0.5"/>

                  {/* ── LEAF right on main stem ── */}
                  <path d="M160 390 C170 380, 184 374, 198 374 C186 382, 172 386, 161 392" strokeWidth="3.5"/>
                  <path d="M160 392 C172 392, 184 396, 194 404 C182 406, 168 400, 160 394" strokeWidth="3"/>
                  <path d="M160 392 C172 384, 182 378, 192 376" strokeWidth="1.5" opacity="0.5"/>

                  {/* ── SMALL FLOWER on lower branch ── */}
                  <path d="M156 420 C142 414, 126 412, 112 416" strokeWidth="3.5"/>
                  {/* Tiny flower */}
                  <path d="M106 412 C100 408, 94 408, 94 414 C94 420, 100 424, 106 422 C112 420, 114 414, 110 410 C106 406, 102 408, 104 412 Z" strokeWidth="2.5"/>
                  <path d="M96 412 C90 406, 86 396, 90 390 C94 384, 100 388, 102 396 C104 404, 100 410, 98 414" strokeWidth="2.8"/>
                  <path d="M100 408 C98 400, 100 390, 106 386 C112 382, 116 390, 112 398 C108 406, 102 410, 100 410" strokeWidth="2.8"/>
                  <path d="M108 408 C112 400, 118 394, 124 394 C120 402, 114 406, 110 410" strokeWidth="2.8"/>
                  <path d="M110 416 C116 414, 122 416, 124 422 C118 424, 112 420, 110 418" strokeWidth="2.8"/>

                  {/* ── GRASS / small sprigs at base ── */}
                  <path d="M148 458 C144 444, 140 432, 138 420" strokeWidth="2.5"/>
                  <path d="M152 460 C156 446, 158 432, 162 420" strokeWidth="2.5"/>
                  <path d="M150 460 C148 448, 144 438, 140 428" strokeWidth="2"/>
                  <path d="M154 460 C158 448, 164 438, 168 428" strokeWidth="2"/>

                  {/* ── LOOSE DOTS / seeds scattered ── */}
                  <circle cx="220" cy="172" r="2.5" strokeWidth="2" fill="#1A1510"/>
                  <circle cx="228" cy="180" r="2" strokeWidth="2" fill="#1A1510"/>
                  <circle cx="214" cy="182" r="1.5" strokeWidth="1.5" fill="#1A1510"/>
                  <circle cx="56" cy="206" r="2" strokeWidth="2" fill="#1A1510"/>
                  <circle cx="62" cy="198" r="1.5" strokeWidth="1.5" fill="#1A1510"/>
                </svg>
                <h4 style={{ ...styles.motto, position: 'relative', zIndex: 1 }}>"{listing.motto}"</h4>
              </div>
            )}
            {/* Collage photo grid — fills remaining space */}
            <div className="photo-collage" style={{ position: 'relative', flex: 1 }}>
              {photos.length === 0 ? (
                <div style={styles.heroPlaceholder}>🏡</div>
              ) : photos.length === 1 ? (
                <div className="photo-single" style={{ borderRadius: 12, overflow: 'hidden', height: 480, cursor: 'zoom-in' }} onClick={() => openCarousel(0)}>
                  <img src={photos[0]} alt={listing.title} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(0.72) sepia(0.18) brightness(0.97)' }} />
                </div>
              ) : (
                <div className="photo-collage-inner" style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gridTemplateRows: photos.length >= 4 ? '1fr 1fr' : '1fr', gap: 4, height: 480, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ gridRow: '1 / -1', overflow: 'hidden', cursor: 'zoom-in', position: 'relative' }} onClick={() => openCarousel(0)}>
                    <img src={photos[0]} alt={listing.title} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s', display: 'block', filter: 'saturate(0.72) sepia(0.18) brightness(0.97)' }}
                      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
                      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                    />
                  </div>
                  {photos.slice(1, 3).map((p, i) => (
                    <div key={i} style={{ overflow: 'hidden', cursor: 'zoom-in', position: 'relative' }} onClick={() => openCarousel(i + 1)}>
                      <img src={p} alt={`${listing.title} ${i + 2}`} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s', display: 'block', filter: 'saturate(0.72) sepia(0.18) brightness(0.97)' }}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                      />
                      {i === 1 && photos.length > 3 && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '1.1rem', letterSpacing: '0.02em' }}>
                          +{photos.length - 3} more
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <span style={styles.heroBadge}>{typeInfo.emoji} {typeInfo.label}</span>
              <button onClick={toggleSave} title={saved ? 'Remove from saved' : 'Save listing'}
                style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%', width: 42, height: 42, cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 2 }}
              >{saved ? '❤️' : '🤍'}</button>
            </div>
          </div>

          {/* Motto — mobile only, shown below photos */}
          {listing.motto && (
            <div className="mobile-motto">
              <h4 style={styles.motto}>"{listing.motto}"</h4>
            </div>
          )}

          {/* Carousel modal */}
          {carouselOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={closeCarousel}>
              <button onClick={closeCarousel} style={{ position: 'absolute', top: 20, right: 24, background: 'none', border: 'none', color: '#fff', fontSize: '2rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
              <button onClick={e => { e.stopPropagation(); carouselPrev(photos.length) }}
                style={{ position: 'absolute', left: 20, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 48, height: 48, color: '#fff', fontSize: '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
              <img src={photos[carouselIndex]} alt={`${listing.title} ${carouselIndex + 1}`}
                style={{ maxHeight: '90vh', maxWidth: '90vw', objectFit: 'contain', borderRadius: 8 }}
                onClick={e => e.stopPropagation()} />
              <button onClick={e => { e.stopPropagation(); carouselNext(photos.length) }}
                style={{ position: 'absolute', right: 20, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 48, height: 48, color: '#fff', fontSize: '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
              <span style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', fontWeight: 600 }}>{carouselIndex + 1} / {photos.length}</span>
            </div>
          )}

          <div style={styles.content}>
            {/* Header */}
            <div style={styles.header}>
              <div>
                <h1 style={styles.title}>{listing.title}</h1>
                <div style={styles.location}>📍 {listing.location}</div>
              </div>
              <div style={styles.price}>{formatPrice(listing.price)}</div>
            </div>

            {/* Meta tags */}
            <div style={styles.metaTags}>
              {listing.beds != null && (
                <span style={styles.metaTag}>🛏 {listing.beds} bed{listing.beds !== 1 ? 's' : ''}</span>
              )}
              {listing.baths != null && (
                <span style={styles.metaTag}>🚿 {listing.baths} bath{listing.baths !== 1 ? 's' : ''}</span>
              )}
              {listing.bills_included && (
                <span style={{ ...styles.metaTag, ...styles.metaTagGreen }}>✓ Bills included</span>
              )}
              {listing.furnished && (
                <span style={styles.metaTag}>🛋 Furnished</span>
              )}
              {listing.pet_friendly === true && (
                <span style={styles.metaTag}>🐾 Pet friendly</span>
              )}
              {listing.pet_friendly === false && (
                <span style={styles.metaTag}>🚫 No pets</span>
              )}
              <span style={styles.metaTag}>📅 Available {formatDate(listing.available_date)}</span>
              {listing.sublet_until && (
                <span style={styles.metaTag}>🔚 Until {formatDate(listing.sublet_until)}</span>
              )}
            </div>

            {/* Description */}
            {listing.description && (
              <div style={styles.section}>
                <h2 style={styles.sectionTitle}>About this listing</h2>
                <p style={styles.description}>{listing.description}</p>
              </div>
            )}

            {/* Star signs */}
            {listing.star_signs?.length > 0 && (
              <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Star signs in the household ✨</h2>
                <div style={styles.tagRow}>
                  {listing.star_signs.map(s => (
                    <span key={s} style={styles.metaTag}>{STAR_SIGN_EMOJI[s] ?? '⭐'} {s.charAt(0).toUpperCase() + s.slice(1)}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Music vibes */}
            {listing.music_vibes?.length > 0 && (
              <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Music vibe 🎵</h2>
                <div style={styles.tagRow}>
                  {listing.music_vibes.map(v => (
                    <span key={v} style={styles.metaTag}>{MUSIC_VIBE_EMOJI[v] ?? '🎶'} {v.charAt(0).toUpperCase() + v.slice(1)}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Spotify */}
            {listing.spotify_url && (
              <div style={styles.section}>
                <a href={listing.spotify_url} target="_blank" rel="noopener noreferrer" style={styles.spotifyLink}>
                  🎵 Listen to the vibe playlist
                </a>
              </div>
            )}

            {/* Social links */}
            {(listing.instagram || listing.linkedin || listing.airbnb) && (
              <div style={styles.section}>
                <h2 style={styles.sectionTitle}>About the landlord</h2>
                <div style={styles.socialLinks}>
                  {listing.instagram && (
                    <a href={listing.instagram} target="_blank" rel="noopener noreferrer" style={{ ...styles.socialLink, borderColor: '#E1306C', color: '#E1306C' }}>
                      📸 Instagram
                    </a>
                  )}
                  {listing.linkedin && (
                    <a href={listing.linkedin} target="_blank" rel="noopener noreferrer" style={{ ...styles.socialLink, borderColor: '#0077B5', color: '#0077B5' }}>
                      💼 LinkedIn
                    </a>
                  )}
                  {listing.airbnb && (
                    <a href={listing.airbnb} target="_blank" rel="noopener noreferrer" style={{ ...styles.socialLink, borderColor: '#FF5A5F', color: '#FF5A5F' }}>
                      🏡 Airbnb reviews
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* CTA */}
            <div style={styles.ctaWrap}>
              {enquirySent ? (
                <div style={styles.enquirySent}>
                  ✓ Message sent! The landlord will be in touch.
                </div>
              ) : (
                <>
                  <textarea
                    value={enquiryMessage}
                    onChange={e => setEnquiryMessage(e.target.value)}
                    placeholder="Hi, I'm interested in your listing. Could you tell me more about…"
                    style={{ width: '100%', minHeight: '100px', padding: '0.8rem 1rem', borderRadius: '12px', border: '1.5px solid #E2D9CE', fontFamily: 'DM Sans, sans-serif', fontSize: '0.9rem', marginBottom: '0.8rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                  />
                  <button
                    style={styles.ctaBtn}
                    onClick={handleEnquiry}
                    disabled={enquiryLoading || !enquiryMessage.trim()}
                  >
                    {enquiryLoading ? 'Sending…' : 'Send message →'}
                  </button>
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  )
}

const globalStyles = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --cream: #FAF7F5; --warm-white: #FFF8F4; --dark: #1A1A1A; --mid: #5A4F45;
    --accent: #f7b188; --border: #E2D9CE; --card: #FFFFFF;
    --green: #2E7D52; --shadow: 0 6px 28px rgba(26,26,26,0.1);
  }
  body { font-family: 'DM Sans', sans-serif; background: var(--warm-white); color: var(--dark); }
  a { text-decoration: none; color: inherit; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .photo-motto-row { display: flex; gap: 2rem; align-items: flex-start; margin-bottom: 2rem; }
  .motto-strip { flex-shrink: 0; width: 180px; padding-top: 3.5rem; }
  .mobile-motto { display: none; }

  @media (max-width: 680px) {
    .photo-motto-row { flex-direction: column; gap: 0; margin-bottom: 0; }
    .motto-strip { display: none; }
    .mobile-motto { display: block; padding: 1.4rem 0 0.5rem; }
    .photo-collage { border-radius: 0 !important; margin: 0 -1.5rem; width: calc(100% + 3rem) !important; }
    .photo-collage-inner { border-radius: 0 !important; height: 300px !important; }
    .photo-single { border-radius: 0 !important; height: 300px !important; margin: 0 -1.5rem; width: calc(100% + 3rem) !important; }
  }
`

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#FFF8F4',
  },
  nav: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    background: '#FFFFFF',
    borderBottom: '1px solid #E2D9CE',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 2rem',
    height: 56,
  },
  navLogo: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '1.3rem',
    fontWeight: 400,
    color: '#1A1A1A',
    letterSpacing: '0.05em',
  },
  navBack: {
    fontSize: '0.85rem',
    color: '#5A4F45',
    fontWeight: 500,
  },
  main: {
    maxWidth: 1060,
    margin: '0 auto',
    padding: '2.5rem 1.5rem 4rem',
  },
  hero: {
    position: 'relative' as const,
    height: 400,
    background: '#F0EFED',
    overflow: 'hidden',
    marginBottom: '2rem',
  },
  heroImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    display: 'block',
  },
  heroPlaceholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontSize: '5rem',
  },
  heroBadge: {
    position: 'absolute' as const,
    bottom: 16,
    left: 16,
    background: 'rgba(255,255,255,0.92)',
    border: '1px solid #E2D9CE',
    borderRadius: 20,
    padding: '0.3rem 0.9rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#1A1A1A',
  },
  content: {
    maxWidth: 680,
    margin: '0 auto',
    padding: '0 1rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '1rem',
    marginBottom: '1rem',
    flexWrap: 'wrap' as const,
  },
  title: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 'clamp(1.6rem, 3vw, 2rem)',
    fontWeight: 700,
    color: '#1A1A1A',
    lineHeight: 1.2,
    marginBottom: 6,
  },
  location: {
    fontSize: '0.9rem',
    color: '#5A4F45',
  },
  price: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '1.4rem',
    fontWeight: 700,
    color: '#1A1A1A',
    whiteSpace: 'nowrap' as const,
  },
  metaTags: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap' as const,
    marginBottom: '1.5rem',
  },
  metaTag: {
    background: '#FAF7F5',
    border: '1px solid #E2D9CE',
    borderRadius: 6,
    padding: '0.3rem 0.75rem',
    fontSize: '0.82rem',
    color: '#5A4F45',
  },
  metaTagGreen: {
    background: '#E8F5EE',
    border: '1px solid #2E7D52',
    color: '#2E7D52',
    fontWeight: 500,
  },
  motto: {
    fontFamily: "'Playfair Display', serif",
    fontWeight: 400,
    fontStyle: 'italic',
    fontSize: '1.3rem',
    lineHeight: 1.5,
    color: '#1A1A1A',
    marginBottom: '1.5rem',
    textAlign: 'left' as const,
  },
  section: {
    marginBottom: '1.5rem',
  },
  sectionTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '1.1rem',
    fontWeight: 700,
    color: '#1A1A1A',
    marginBottom: '0.6rem',
  },
  description: {
    fontSize: '0.95rem',
    color: '#5A4F45',
    lineHeight: 1.8,
    whiteSpace: 'pre-wrap' as const,
  },
  spotifyLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    fontSize: '0.88rem',
    fontWeight: 600,
    color: '#1DB954',
    border: '1.5px solid #1DB954',
    borderRadius: 6,
    padding: '0.5rem 1rem',
  },
  ctaWrap: {
    marginTop: '2rem',
    paddingTop: '1.5rem',
    borderTop: '1px solid #E2D9CE',
  },
  ctaBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#1A1A1A',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '0.9rem 2rem',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    maxWidth: 320,
  },
  enquirySent: {
    background: '#E8F5EE',
    border: '1px solid #2E7D52',
    borderRadius: 8,
    padding: '0.9rem 1.5rem',
    color: '#2E7D52',
    fontWeight: 600,
    fontSize: '0.9rem',
    display: 'inline-block',
  },
  loadingWrap: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: '5rem',
  },
  spinner: {
    width: 36,
    height: 36,
    border: '3px solid #E2D9CE',
    borderTopColor: '#f7b188',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  notFound: {
    textAlign: 'center' as const,
    padding: '5rem 1rem',
  },
  notFoundTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '1.6rem',
    fontWeight: 700,
    marginBottom: '0.5rem',
    color: '#1A1A1A',
  },
  notFoundText: {
    color: '#5A4F45',
    marginBottom: '1.5rem',
  },
  backLink: {
    color: '#f7b188',
    fontWeight: 600,
    fontSize: '0.9rem',
  },
  tagRow: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap' as const,
  },
  socialLinks: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap' as const,
  },
  socialLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    border: '1.5px solid',
    borderRadius: 6,
    padding: '0.45rem 0.9rem',
  },
}
