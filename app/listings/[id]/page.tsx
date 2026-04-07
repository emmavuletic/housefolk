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
          {/* Collage photo grid */}
          <div style={{ position: 'relative', marginBottom: '2rem' }}>
            {photos.length === 0 ? (
              <div style={styles.heroPlaceholder}>🏡</div>
            ) : photos.length === 1 ? (
              <div style={{ borderRadius: 12, overflow: 'hidden', height: 480, cursor: 'zoom-in' }} onClick={() => openCarousel(0)}>
                <img src={photos[0]} alt={listing.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gridTemplateRows: photos.length >= 4 ? '1fr 1fr' : '1fr', gap: 4, height: 480, borderRadius: 12, overflow: 'hidden' }}>
                {/* Main large photo */}
                <div style={{ gridRow: '1 / -1', overflow: 'hidden', cursor: 'zoom-in', position: 'relative' }} onClick={() => openCarousel(0)}>
                  <img src={photos[0]} alt={listing.title} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s', display: 'block' }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                  />
                </div>
                {/* Right column: up to 2 smaller photos */}
                {photos.slice(1, 3).map((p, i) => (
                  <div key={i} style={{ overflow: 'hidden', cursor: 'zoom-in', position: 'relative' }} onClick={() => openCarousel(i + 1)}>
                    <img src={p} alt={`${listing.title} ${i + 2}`} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s', display: 'block' }}
                      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
                      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                    />
                    {/* Show "X more" overlay on last visible tile if more photos exist */}
                    {i === 1 && photos.length > 3 && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '1.1rem', letterSpacing: '0.02em' }}>
                        +{photos.length - 3} more
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Type badge */}
            <span style={styles.heroBadge}>{typeInfo.emoji} {typeInfo.label}</span>
            {/* Save button */}
            <button onClick={toggleSave} title={saved ? 'Remove from saved' : 'Save listing'}
              style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%', width: 42, height: 42, cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 2 }}
            >{saved ? '❤️' : '🤍'}</button>
          </div>

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

            {/* Motto */}
            {listing.motto && (
              <blockquote style={styles.motto}>{listing.motto}</blockquote>
            )}

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
    maxWidth: 800,
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
    padding: '0 0.5rem',
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
    borderLeft: '3px solid #f7b188',
    paddingLeft: '1rem',
    fontStyle: 'italic',
    color: '#f7b188',
    fontSize: '1.05rem',
    lineHeight: 1.6,
    marginBottom: '1.5rem',
    fontFamily: "'Playfair Display', serif",
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
