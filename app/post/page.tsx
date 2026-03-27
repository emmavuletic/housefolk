'use client'

export default function PostPage() {
  function choose(tier: string) {
    window.location.href = `/housefolk.html?goto=post&tier=${tier}`
  }

  return (
    <>
      <style suppressHydrationWarning>{globalStyles}</style>
      <div style={s.page}>
        <nav style={s.nav}>
          <a href="/" style={s.logo}>Housefolk</a>
          <a href="/listings" style={s.navLink}>Browse listings</a>
        </nav>

        <main style={s.main}>
          <h1 style={s.heading}>Post a listing</h1>
          <p style={s.sub}>Choose your listing type to get started. All listings are free.</p>

          <div style={s.grid}>
            {/* Flatshare */}
            <button style={s.card} onClick={() => choose('flatshare')}>
              <div style={{ ...s.ribbon, background: '#f7b188' }}>★ Popular</div>
              <div style={s.icon}>🏠</div>
              <div style={s.name}>Flatshare</div>
              <div style={s.desc}>Find the right flatmate to share your home. Add photos and describe your space.</div>
              <div style={s.chip}>📰 Debuts Thursday</div>
              <ul style={s.feats}>
                <li style={s.feat}><span style={s.chk}>✓</span> Up to 20 photos</li>
                <li style={s.feat}><span style={s.chk}>✓</span> 7-day listing</li>
                <li style={s.feat}><span style={s.chk}>✓</span> Enquiry inbox</li>
                <li style={s.feat}><span style={s.chk}>✓</span> Thursday newsletter</li>
              </ul>
              <div style={s.cta}>Select →</div>
            </button>

            {/* Rental */}
            <button style={s.card} onClick={() => choose('rental')}>
              <div style={s.icon}>🏢</div>
              <div style={s.name}>To Let</div>
              <div style={s.desc}>Rent out your whole property to a tenant or family.</div>
              <div style={s.chip}>📰 Debuts Thursday</div>
              <ul style={s.feats}>
                <li style={s.feat}><span style={s.chk}>✓</span> Up to 20 photos</li>
                <li style={s.feat}><span style={s.chk}>✓</span> 7-day listing</li>
                <li style={s.feat}><span style={s.chk}>✓</span> Enquiry inbox</li>
                <li style={s.feat}><span style={s.chk}>✓</span> Thursday newsletter</li>
              </ul>
              <div style={s.cta}>Select →</div>
            </button>

            {/* Sublet */}
            <button style={s.card} onClick={() => choose('sublet')}>
              <div style={s.icon}>🌿</div>
              <div style={s.name}>Sublet</div>
              <div style={s.desc}>Subletting short-term? Post it for free — no card needed, ever.</div>
              <div style={{ ...s.chip, background: '#E8F5EE', color: '#2E7D52' }}>✓ Debuts Thursday</div>
              <ul style={s.feats}>
                <li style={s.feat}><span style={{ ...s.chk, color: '#2E7D52' }}>✓</span> Up to 10 photos</li>
                <li style={s.feat}><span style={{ ...s.chk, color: '#2E7D52' }}>✓</span> 7-day listing</li>
                <li style={s.feat}><span style={{ ...s.chk, color: '#2E7D52' }}>✓</span> Enquiry form</li>
                <li style={s.feat}><span style={{ ...s.chk, color: '#2E7D52' }}>✓</span> Thursday newsletter</li>
              </ul>
              <div style={{ ...s.cta, color: '#2E7D52' }}>Select →</div>
            </button>
          </div>
        </main>
      </div>
    </>
  )
}

const globalStyles = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', sans-serif; background: #FFF8F4; color: #1A1A1A; }
  button { font-family: inherit; }
`

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#FFF8F4' },
  nav: {
    position: 'sticky', top: 0, zIndex: 100,
    background: '#fff', borderBottom: '1px solid #E2D9CE',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 2rem', height: 56,
  },
  logo: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '1.3rem', fontWeight: 400, color: '#1A1A1A',
    letterSpacing: '0.05em', textDecoration: 'none',
  },
  navLink: {
    fontSize: '0.85rem', color: '#5A4F45', fontWeight: 500, textDecoration: 'none',
  },
  main: { maxWidth: 900, margin: '0 auto', padding: '3rem 1.5rem 5rem' },
  heading: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400,
    color: '#1A1A1A', marginBottom: '0.5rem',
  },
  sub: { fontSize: '0.95rem', color: '#5A4F45', marginBottom: '2.5rem' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '1.25rem',
  },
  card: {
    position: 'relative' as const,
    background: '#fff', border: '1.5px solid #E2D9CE',
    borderRadius: 16, padding: '1.6rem 1.4rem',
    cursor: 'pointer', textAlign: 'left' as const,
    display: 'flex', flexDirection: 'column' as const,
    transition: 'box-shadow 0.2s, border-color 0.2s',
    boxShadow: '0 2px 12px rgba(26,26,26,0.06)',
  },
  ribbon: {
    position: 'absolute' as const, top: 0, right: 0,
    fontSize: '0.65rem', fontWeight: 700,
    padding: '0.28rem 0.8rem',
    borderBottomLeftRadius: 10,
    color: '#fff', letterSpacing: '0.4px',
  },
  icon: { fontSize: '2rem', marginBottom: '0.8rem' },
  name: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.3rem',
  },
  desc: { fontSize: '0.82rem', color: '#5A4F45', lineHeight: 1.5, marginBottom: '1rem' },
  chip: {
    display: 'inline-block',
    background: '#FFF3EC', color: '#C06A2A',
    border: '1px solid #f7b188',
    borderRadius: 20, padding: '0.2rem 0.7rem',
    fontSize: '0.73rem', fontWeight: 600, marginBottom: '1rem',
  },
  feats: { listStyle: 'none', display: 'flex', flexDirection: 'column' as const, gap: '0.45rem', flex: 1, marginBottom: '1.2rem' },
  feat: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: '#5A4F45' },
  chk: { color: '#f7b188', fontWeight: 700 },
  cta: { fontWeight: 700, fontSize: '0.9rem', color: '#1A1A1A' },
}
