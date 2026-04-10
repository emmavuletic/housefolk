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
  bills_included: boolean
  furnished: boolean | null
  pet_friendly: boolean | null
  description: string | null
  photos: string[]
  status: string
}

const BLOG_CARDS = [
  {
    label: 'Editorial',
    text: 'The High Street Agent Problem in London',
    img: 'https://images.squarespace-cdn.com/content/v1/65269ad14b578b509faf9caf/1773148269386-0YF03HXZF5CKAXVYHHCP/image-asset.jpeg',
    url: 'https://www.housefolk.co/blog/the-high-street-agent-problem-in-london',
  },
  {
    label: 'Home',
    text: 'How to Transform Your Rental into a Residence',
    img: 'https://images.squarespace-cdn.com/content/v1/65269ad14b578b509faf9caf/1717673381346-3TYP4TCCPQZF6J1GO3IO/image-asset.jpeg',
    url: 'https://www.housefolk.co/blog/how-to-make-a-rental-feel-like-a-home',
  },
  {
    label: 'People & Homes',
    text: 'Lucy McWhirter: Culinary and Creative Harmony in Hackney',
    img: 'https://images.squarespace-cdn.com/content/v1/65269ad14b578b509faf9caf/1715584884567-PENE8DHSDGQTR73NR1S7/Screenshot+2024-05-13+at+08.15.27.png',
    url: 'https://www.housefolk.co/blog/lucy-mcwhirter-crafting-culinary-and-creative-harmony-in-hackney',
  },
  {
    label: 'Design',
    text: 'The Eames Show Us How to Live Together',
    img: 'https://images.squarespace-cdn.com/content/v1/65269ad14b578b509faf9caf/1701273743281-9ZWP4AWKPH7UTTH5KNS9/image-asset.jpeg',
    url: 'https://www.housefolk.co/blog/the-eames-showed-us-how-to-live-together',
  },
  {
    label: 'Design',
    text: "Living Between the Known and the Mystical: Beata Heuman's Style",
    img: 'https://images.squarespace-cdn.com/content/v1/65269ad14b578b509faf9caf/1701275657882-RLLBNJAJNUMHAWPO0WPF/image-asset.jpeg',
    url: 'https://www.housefolk.co/blog/elevating-our-living-spaces-beata-humans-style',
  },
  {
    label: 'Neighbourhood',
    text: 'Discovering Wilton Way, E8\'s Hidden Gems',
    img: 'https://images.squarespace-cdn.com/content/v1/65269ad14b578b509faf9caf/1700047143007-2KUJJP59MI6UQBG80MFO/image-asset.jpeg',
    url: 'https://www.housefolk.co/blog/discovering-wilton-way-e8s-hidden-gems',
  },
  {
    label: 'Renting',
    text: 'How to Live Together: a Guide to Shared Housing',
    img: 'https://images.squarespace-cdn.com/content/v1/65269ad14b578b509faf9caf/1697056807339-F3JQPNFGU1JIWNELDY7V/image-asset.jpeg',
    url: 'https://www.housefolk.co/blog/blog-post-title-one-7ldmh',
  },
  {
    label: 'Editorial',
    text: 'The Unfair Practices of High Street Letting Agencies',
    img: 'https://images.squarespace-cdn.com/content/v1/65269ad14b578b509faf9caf/1700053146569-PNUL609YWN24HWSOAYFB/image-asset.jpeg',
    url: 'https://www.housefolk.co/blog/the-unfair-practices-of-high-street-letting-agencies-and-the-birth-of-the-letting-circle',
  },
]

const TYPE_LABELS: Record<string, { emoji: string; label: string }> = {
  flatshare: { emoji: '🏠', label: 'Flatshare' },
  rental: { emoji: '🏢', label: 'Rental' },
  sublet: { emoji: '🌿', label: 'Sublet' },
}

function formatPrice(pence: number | null): string {
  if (!pence) return 'Free sublet'
  return `£${(pence / 100).toLocaleString('en-GB')}/mo`
}

function ListingCard({ listing, isSaved, onToggleSave }: {
  listing: Listing
  isSaved: boolean
  onToggleSave: (e: React.MouseEvent) => void
}) {
  const photo = listing.photos?.[0]
  const typeInfo = TYPE_LABELS[listing.type] ?? { emoji: '🏠', label: listing.type }

  return (
    <a href={`/listings/${listing.id}`} style={styles.card}>
      <div style={styles.cardPhoto}>
        {photo ? (
          <img src={photo} alt={listing.title} style={styles.cardImg} />
        ) : (
          <div style={styles.cardPlaceholder}>🏡</div>
        )}
        <span style={styles.typeBadge}>{typeInfo.emoji} {typeInfo.label}</span>
        <button
          onClick={onToggleSave}
          title={isSaved ? 'Remove from saved' : 'Save listing'}
          style={styles.heartBtn}
        >{isSaved ? '❤️' : '🤍'}</button>
      </div>
      <div style={styles.cardBody}>
        <div style={styles.cardPrice}>{formatPrice(listing.price)}</div>
        <div style={styles.cardTitle}>{listing.title}</div>
        <div style={styles.cardLocation}>📍 {listing.location}</div>
        <div style={styles.cardTags}>
          {listing.beds != null && (
            <span style={styles.tag}>{listing.beds} bed{listing.beds !== 1 ? 's' : ''}</span>
          )}
          {listing.bills_included && <span style={styles.tagGreen}>Bills incl.</span>}
        </div>
        {listing.description && (
          <p style={styles.cardDesc}>{listing.description}</p>
        )}
        <span style={styles.viewLink}>View listing →</span>
      </div>
    </a>
  )
}

function BlogCard({ index }: { index: number }) {
  const card = BLOG_CARDS[index % BLOG_CARDS.length]
  return (
    <a href={card.url} target="_blank" rel="noopener noreferrer" style={styles.blogCard}>
      <div style={{ ...styles.blogCardTop, backgroundImage: `url(${card.img})` }} />
      <div style={styles.blogCardBody}>
        <p style={styles.blogCardText}>{card.text}</p>
        <div style={styles.blogCardFooter}>
          <span style={styles.blogCardLabel}>✍️ {card.label}</span>
          <span style={styles.blogCardLink}>Read more →</span>
        </div>
      </div>
    </a>
  )
}

function SkeletonCard() {
  return (
    <div style={styles.card}>
      <div style={{ ...styles.cardPhoto, background: '#E2D9CE' }} />
      <div style={styles.cardBody}>
        <div style={{ ...styles.skeletonLine, width: '40%', marginBottom: 8 }} />
        <div style={{ ...styles.skeletonLine, width: '80%', marginBottom: 6 }} />
        <div style={{ ...styles.skeletonLine, width: '60%', marginBottom: 10 }} />
        <div style={{ ...styles.skeletonLine, width: '50%' }} />
      </div>
    </div>
  )
}

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [location, setLocation] = useState('')
  const [type, setType] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [city, setCity] = useState('London')
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token
      if (!token) {
        window.location.href = '/housefolk.html'
        return
      }

      const params = new URLSearchParams()
      if (type) params.set('type', type)
      if (location) params.set('location', location)
      else if (city && city !== 'Other places') params.set('location', city)

      fetch(`/api/listings?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(({ listings: data }) => {
          let results = data ?? []
          if (city === 'Other places' && !location) {
            const mainCities = ['london', 'melbourne', 'brooklyn']
            results = results.filter((l: Listing) =>
              !mainCities.some(c => l.location.toLowerCase().includes(c))
            )
          }
          setListings(results)
          setLoading(false)
        })
        .catch(() => setLoading(false))

      // Load saved IDs
      fetch('/api/listings/saved', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(({ listings: saved }) => {
          setSavedIds(new Set((saved || []).map((l: { id: string }) => l.id)))
        })
        .catch(() => {})
    })
  }, [type, location, city])

  async function toggleSave(listingId: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const isSaved = savedIds.has(listingId)
    if (isSaved) {
      await fetch(`/api/listings/${listingId}/save`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      setSavedIds(prev => { const next = new Set(prev); next.delete(listingId); return next })
    } else {
      await fetch(`/api/listings/${listingId}/save`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      setSavedIds(prev => { const next = new Set(prev); next.add(listingId); return next })
    }
  }

  const filtered = maxPrice
    ? listings.filter(l => l.price == null || l.price <= parseInt(maxPrice) * 100)
    : listings

  return (
    <>
      <style suppressHydrationWarning>{globalStyles}</style>
      <div style={styles.page}>
        {/* Nav */}
        <nav style={styles.nav}>
          <a href="/housefolk.html" style={styles.navLogo}>Housefolk</a>
          <a href="/housefolk.html" style={styles.navBack}>← My account</a>
          <a href="/post.html" style={styles.navCta}>Post a listing</a>
        </nav>

        {/* Hero header */}
        <div style={{ background: '#ffffff', borderBottom: '1px solid #E2D9CE', padding: '3rem 2rem 2.5rem' }}>
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, color: '#1A1A1A', marginBottom: '0.5rem' }}>Browse listings</h1>
            <p style={{ fontSize: '0.95rem', color: '#5A4F45' }}>Flatshares, rentals and sublets across the UK.</p>
          </div>
        </div>

        <main style={styles.main}>
          {/* City tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.2rem' }}>
            {['London', 'Melbourne', 'Brooklyn', 'Other places'].map(c => (
              <button
                key={c}
                onClick={() => { setCity(c); setLocation(''); setLoading(true) }}
                style={{
                  padding: '0.5rem 1.2rem',
                  borderRadius: '50px',
                  border: '1.5px solid',
                  borderColor: city === c ? '#1A1510' : '#E2D9CE',
                  background: city === c ? '#1A1510' : '#fff',
                  color: city === c ? '#fff' : '#5A4F45',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >{c}</button>
            ))}
          </div>

          {/* Filters */}
          <div style={styles.filters}>
            <input
              style={styles.filterInput}
              placeholder="Search by location…"
              value={location}
              onChange={e => setLocation(e.target.value)}
            />
            <select
              style={styles.filterSelect}
              value={type}
              onChange={e => setType(e.target.value)}
            >
              <option value="">All types</option>
              <option value="flatshare">🏠 Flatshare</option>
              <option value="rental">🏢 Rental</option>
              <option value="sublet">🌿 Sublet</option>
            </select>
            <select
              style={styles.filterSelect}
              value={maxPrice}
              onChange={e => setMaxPrice(e.target.value)}
            >
              <option value="">Any price</option>
              <option value="800">Up to £800/mo</option>
              <option value="1200">Up to £1,200/mo</option>
              <option value="1800">Up to £1,800/mo</option>
              <option value="2500">Up to £2,500/mo</option>
              <option value="3500">Up to £3,500/mo</option>
            </select>
          </div>

          {/* Grid */}
          {loading ? (
            <div style={styles.grid}>
              {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyEmoji}>🏡</div>
              <p style={styles.emptyText}>No listings found. Try adjusting your filters.</p>
            </div>
          ) : (
            <div style={styles.grid}>
              {filtered.flatMap((l, i) => {
                const cards = [
                  <ListingCard
                    key={l.id}
                    listing={l}
                    isSaved={savedIds.has(l.id)}
                    onToggleSave={e => toggleSave(l.id, e)}
                  />
                ]
                if ((i + 1) % 3 === 0) {
                  cards.push(<BlogCard key={`blog-${i}`} index={Math.floor(i / 3)} />)
                }
                return cards
              })}
            </div>
          )}
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
    textDecoration: 'none',
  },
  navCta: {
    background: '#1A1A1A',
    color: '#FFFFFF',
    padding: '0.5rem 1.1rem',
    borderRadius: 6,
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  main: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '2.5rem 2rem 4rem',
  },
  heading: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 'clamp(1.8rem, 3vw, 2.4rem)',
    fontWeight: 400,
    color: '#1A1A1A',
    marginBottom: '1.5rem',
  },
  filters: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap' as const,
    marginBottom: '2rem',
  },
  filterInput: {
    flex: '1 1 200px',
    background: '#FAF7F5',
    border: '1.5px solid #E2D9CE',
    borderRadius: 6,
    padding: '0.65rem 1rem',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.9rem',
    color: '#1A1A1A',
    outline: 'none',
  },
  filterSelect: {
    flex: '0 0 auto',
    background: '#FAF7F5',
    border: '1.5px solid #E2D9CE',
    borderRadius: 6,
    padding: '0.65rem 1rem',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.9rem',
    color: '#1A1A1A',
    outline: 'none',
    cursor: 'pointer',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '1.25rem',
  },
  card: {
    display: 'block',
    background: '#FFFFFF',
    borderRadius: 10,
    overflow: 'hidden',
    boxShadow: '0 2px 12px rgba(26,26,26,0.07)',
    border: '1px solid #E2D9CE',
    transition: 'box-shadow 0.2s, transform 0.2s',
    cursor: 'pointer',
  },
  cardPhoto: {
    position: 'relative' as const,
    height: 200,
    background: '#F0EFED',
    overflow: 'hidden',
  },
  cardImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    display: 'block',
  },
  cardPlaceholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontSize: '3rem',
    color: '#8A7E74',
  },
  typeBadge: {
    position: 'absolute' as const,
    top: 10,
    left: 10,
    background: 'rgba(255,255,255,0.92)',
    border: '1px solid #E2D9CE',
    borderRadius: 20,
    padding: '0.2rem 0.65rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#1A1A1A',
  },
  heartBtn: {
    position: 'absolute' as const,
    top: 10,
    right: 10,
    background: 'rgba(255,255,255,0.9)',
    border: 'none',
    borderRadius: '50%',
    width: 34,
    height: 34,
    cursor: 'pointer',
    fontSize: '1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    zIndex: 2,
  },
  cardBody: {
    padding: '1rem 1.1rem 1.2rem',
  },
  cardPrice: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '1.1rem',
    fontWeight: 700,
    color: '#1A1A1A',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#1A1A1A',
    marginBottom: 4,
    lineHeight: 1.3,
  },
  cardLocation: {
    fontSize: '0.82rem',
    color: '#5A4F45',
    marginBottom: 8,
  },
  cardTags: {
    display: 'flex',
    gap: '0.4rem',
    flexWrap: 'wrap' as const,
    marginBottom: 8,
  },
  tag: {
    background: '#FAF7F5',
    border: '1px solid #E2D9CE',
    borderRadius: 4,
    padding: '0.15rem 0.5rem',
    fontSize: '0.74rem',
    color: '#5A4F45',
  },
  tagGreen: {
    background: '#E8F5EE',
    border: '1px solid #2E7D52',
    borderRadius: 4,
    padding: '0.15rem 0.5rem',
    fontSize: '0.74rem',
    color: '#2E7D52',
    fontWeight: 500,
  },
  cardDesc: {
    fontSize: '0.82rem',
    color: '#5A4F45',
    lineHeight: 1.5,
    marginBottom: 10,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  },
  viewLink: {
    fontSize: '0.83rem',
    fontWeight: 600,
    color: '#f7b188',
  },
  skeletonLine: {
    height: 14,
    background: '#E2D9CE',
    borderRadius: 4,
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  blogCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    background: '#FFFFFF',
    borderRadius: 10,
    overflow: 'hidden',
    border: '1px solid #E2D9CE',
    boxShadow: '0 2px 12px rgba(26,26,26,0.07)',
    cursor: 'pointer',
    textDecoration: 'none',
  },
  blogCardTop: {
    height: 200,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    display: 'flex',
    alignItems: 'flex-end',
    padding: '1rem',
    position: 'relative' as const,
  },
  blogCardLabel: {
    background: '#1A1A1A',
    borderRadius: 999,
    padding: '0.3rem 0.85rem',
    fontSize: '0.74rem',
    fontWeight: 600,
    color: '#FAF7F5',
    whiteSpace: 'nowrap' as const,
  },
  blogCardBody: {
    padding: '1rem 1.1rem 1.1rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  blogCardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  blogCardText: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '1rem',
    fontWeight: 400,
    color: '#1A1A1A',
    lineHeight: 1.4,
    fontStyle: 'italic',
  },
  blogCardLink: {
    fontSize: '0.83rem',
    fontWeight: 600,
    color: '#f7b188',
  },
  empty: {
    textAlign: 'center' as const,
    padding: '5rem 1rem',
  },
  emptyEmoji: {
    fontSize: '3rem',
    marginBottom: '1rem',
  },
  emptyText: {
    color: '#5A4F45',
    fontSize: '1rem',
  },
}
