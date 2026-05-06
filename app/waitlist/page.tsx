'use client'

import { useState } from 'react'

export default function WaitlistPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email.trim()) { setError('Please enter your email address.'); return }
    if (!emailRe.test(email.trim())) { setError("That doesn't look like a valid email."); return }

    setLoading(true)
    try {
      const res = await fetch('/api/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong.')
      setDone(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style suppressHydrationWarning>{css}</style>
      <div className="wl-page">

        {/* ── Left ── */}
        <div className="wl-left">
          <div className="wl-left-bg" />
          <a href="/housefolk.html" className="wl-logo">Housefolk</a>

          <div className="wl-body">
            <div className="wl-eyebrow">
              <span className="wl-dot" />
              Opening soon
            </div>
            <h1 className="wl-h1">Homes for people who notice <em>good light.</em></h1>
            <p className="wl-p">Housefolk connects design-aware renters with landlords who care — about original floors, south-facing windows, and rooms that feel like somewhere.</p>
            <div className="wl-proofs">
              <div className="wl-proof"><span className="wl-proof-icon">✦</span>Curated listings from landlords who get it</div>
              <div className="wl-proof"><span className="wl-proof-icon">✉</span>New homes, straight to your inbox</div>
              <div className="wl-proof"><span className="wl-proof-icon">◎</span>Free for renters, always</div>
            </div>
          </div>

          <div className="wl-foot">© 2025 Housefolk</div>
        </div>

        {/* ── Right ── */}
        <div className="wl-right">
          <div className="wl-form-wrap">

            {done ? (
              <div className="wl-success">
                <div className="wl-success-icon">✦</div>
                <h2 className="wl-success-h2">You're on the list.</h2>
                <p className="wl-success-p">We'll be in touch when we launch near you.</p>
              </div>
            ) : (
              <>
                <div className="wl-form-label">Waitlist</div>
                <h2 className="wl-form-title">Get early access</h2>
                <p className="wl-form-sub">Be the first to know when we launch in your city. No spam — just homes worth seeing.</p>

                <form onSubmit={handleSubmit} noValidate>
                  <div className="wl-field">
                    <label htmlFor="wl-name">Your name</label>
                    <input
                      id="wl-name"
                      type="text"
                      placeholder="Ada Lovelace"
                      autoComplete="given-name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                    />
                  </div>
                  <div className="wl-field">
                    <label htmlFor="wl-email">Email address <span style={{ color: '#C0392B' }}>*</span></label>
                    <input
                      id="wl-email"
                      type="email"
                      placeholder="ada@example.com"
                      autoComplete="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  {error && <div className="wl-error">{error}</div>}
                  <button type="submit" className="wl-btn" disabled={loading}>
                    {loading ? 'Adding you…' : 'Join the waitlist'}
                  </button>
                </form>

                <div className="wl-divider"><span>already have an account?</span></div>
                <div className="wl-signin">
                  <a href="/housefolk.html?goto=signin">Sign in to Housefolk →</a>
                </div>
              </>
            )}

          </div>
        </div>

      </div>
    </>
  )
}

const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .wl-page {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 1fr 480px;
    font-family: 'DM Sans', sans-serif;
    -webkit-font-smoothing: antialiased;
    background: #FFF8F4;
    color: #1A1A1A;
  }

  /* Left */
  .wl-left {
    position: relative;
    background: #F0EFED;
    display: flex;
    flex-direction: column;
    padding: 3rem 3.5rem;
    overflow: hidden;
  }
  .wl-left-bg {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 60% 50% at 70% 30%, rgba(247,177,136,0.18) 0%, transparent 70%),
      radial-gradient(ellipse 50% 60% at 20% 80%, rgba(247,177,136,0.10) 0%, transparent 70%);
    pointer-events: none;
  }
  .wl-logo {
    font-family: 'Playfair Display', serif;
    font-size: 2rem;
    font-weight: 400;
    letter-spacing: 0.08em;
    color: #1A1A1A;
    text-decoration: none;
    position: relative;
    z-index: 1;
  }
  .wl-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    position: relative;
    z-index: 1;
    max-width: 440px;
  }
  .wl-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #f7b188;
    margin-bottom: 1.4rem;
  }
  .wl-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #f7b188;
    flex-shrink: 0;
  }
  .wl-h1 {
    font-family: 'Playfair Display', serif;
    font-size: clamp(2rem, 3.2vw, 2.8rem);
    font-weight: 400;
    line-height: 1.12;
    letter-spacing: -0.5px;
    color: #1A1A1A;
    margin-bottom: 1.2rem;
  }
  .wl-h1 em { font-style: italic; color: #f7b188; }
  .wl-p {
    font-size: 0.92rem;
    line-height: 1.75;
    color: #5A4F45;
    max-width: 380px;
    margin-bottom: 2.5rem;
  }
  .wl-proofs { display: flex; flex-direction: column; gap: 0.75rem; }
  .wl-proof {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.84rem;
    color: #5A4F45;
  }
  .wl-proof-icon {
    width: 28px; height: 28px;
    border-radius: 50%;
    background: rgba(247,177,136,0.18);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 0.85rem;
  }
  .wl-foot {
    font-size: 0.72rem;
    color: #9A8E84;
    position: relative;
    z-index: 1;
  }

  /* Right */
  .wl-right {
    background: #FFF8F4;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3rem 2.5rem;
  }
  .wl-form-wrap { width: 100%; max-width: 360px; }
  .wl-form-label {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #9A8E84;
    margin-bottom: 1.8rem;
  }
  .wl-form-title {
    font-family: 'Playfair Display', serif;
    font-size: 1.65rem;
    font-weight: 400;
    margin-bottom: 0.4rem;
    letter-spacing: -0.3px;
  }
  .wl-form-sub {
    font-size: 0.86rem;
    color: #8A7E74;
    margin-bottom: 2rem;
    line-height: 1.55;
  }
  .wl-field { margin-bottom: 1rem; }
  .wl-field label {
    display: block;
    font-size: 0.79rem;
    font-weight: 500;
    color: #5A4F45;
    margin-bottom: 0.4rem;
  }
  .wl-field input {
    width: 100%;
    background: #FAF7F5;
    border: 1.5px solid #E2D9CE;
    border-radius: 6px;
    padding: 0.78rem 1rem;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.92rem;
    color: #1A1A1A;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .wl-field input:focus {
    border-color: #f7b188;
    box-shadow: 0 0 0 3px rgba(247,177,136,0.18);
  }
  .wl-field input::placeholder { color: #C0B4AA; }
  .wl-error {
    font-size: 0.82rem;
    color: #C0392B;
    margin-bottom: 0.75rem;
  }
  .wl-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.85rem 1.6rem;
    border: none;
    border-radius: 6px;
    background: #1A1A1A;
    color: #fff;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.91rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.18s, transform 0.15s;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    margin-top: 0.5rem;
  }
  .wl-btn:hover:not(:disabled) { background: #2A2520; transform: translateY(-1px); }
  .wl-btn:disabled { opacity: 0.6; cursor: default; }
  .wl-divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 1.4rem 0;
    color: #C0B4AA;
    font-size: 0.75rem;
  }
  .wl-divider::before, .wl-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #E2D9CE;
  }
  .wl-signin { text-align: center; font-size: 0.83rem; color: #8A7E74; }
  .wl-signin a {
    color: #1A1A1A;
    font-weight: 600;
    text-decoration: none;
    border-bottom: 1px solid #E2D9CE;
    transition: border-color 0.15s;
  }
  .wl-signin a:hover { border-color: #1A1A1A; }

  /* Success */
  .wl-success { text-align: center; padding: 1rem 0; }
  .wl-success-icon {
    width: 56px; height: 56px;
    border-radius: 50%;
    background: rgba(247,177,136,0.15);
    border: 1.5px solid #fad4b8;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    margin: 0 auto 1.2rem;
  }
  .wl-success-h2 {
    font-family: 'Playfair Display', serif;
    font-size: 1.5rem;
    font-weight: 400;
    margin-bottom: 0.5rem;
    letter-spacing: -0.3px;
  }
  .wl-success-p { font-size: 0.87rem; color: #8A7E74; line-height: 1.6; }

  /* Mobile */
  @media (max-width: 800px) {
    .wl-page { grid-template-columns: 1fr; }
    .wl-left { padding: 2.5rem 2rem 2.8rem; }
    .wl-body { margin: 2rem 0 0; }
    .wl-h1 { font-size: 2rem; }
    .wl-p { margin-bottom: 1.8rem; }
    .wl-foot { margin-top: 2rem; }
    .wl-right { padding: 2.5rem 1.5rem 3rem; align-items: flex-start; }
    .wl-form-wrap { max-width: 100%; }
  }
`
