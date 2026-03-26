/* ══════════════════════════════════════════════
   HOMEFOLK — Real API Client
   Replaces all mock functions with live backend calls
   ══════════════════════════════════════════════ */

// ── AUTH STATE ──
let currentUser = null
let authToken = null
let currentListingId = null

function getToken() {
  return authToken || localStorage.getItem('hf_token')
}
function setSession(user, token, refreshToken, expiresAt) {
  currentUser = user
  authToken = token
  localStorage.setItem('hf_token', token)
  localStorage.setItem('hf_user', JSON.stringify(user))
  if (refreshToken) localStorage.setItem('hf_refresh', refreshToken)
  if (expiresAt) localStorage.setItem('hf_expires', String(expiresAt))
}
function clearSession() {
  currentUser = null
  authToken = null
  localStorage.removeItem('hf_token')
  localStorage.removeItem('hf_user')
  localStorage.removeItem('hf_refresh')
  localStorage.removeItem('hf_expires')
}

async function refreshTokenIfNeeded() {
  const expiresAt = parseInt(localStorage.getItem('hf_expires') || '0', 10)
  const now = Math.floor(Date.now() / 1000)
  if (!expiresAt || now < expiresAt - 60) return true // still valid
  const refreshToken = localStorage.getItem('hf_refresh')
  if (!refreshToken) return false
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!res.ok) return false
  const data = await res.json()
  if (data.error) return false
  authToken = data.access_token
  localStorage.setItem('hf_token', data.access_token)
  if (data.refresh_token) localStorage.setItem('hf_refresh', data.refresh_token)
  if (data.expires_at) localStorage.setItem('hf_expires', String(data.expires_at))
  return true
}

// ── API HELPER ──
async function api(path, opts = {}) {
  await refreshTokenIfNeeded()
  const token = getToken()
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  try {
    const res = await fetch(path, { ...opts, headers, signal: controller.signal })
    clearTimeout(timer)
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) return { error: `Server error (${res.status}). Please try again.` }
    return res.json()
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') return { error: 'Request timed out. Please check your connection and try again.' }
    return { error: err.message || 'Network error. Please try again.' }
  }
}

// ── TOAST ──
function toast(msg, type = '') {
  let t = document.getElementById('toast')
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t) }
  t.textContent = msg
  t.className = 'toast' + (type ? ' ' + type : '')
  void t.offsetWidth
  t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), 3500)
}

// ══ AUTH ══

async function doSignIn() {
  const email = document.getElementById('si-email').value.trim()
  const password = document.getElementById('si-pass').value
  if (!email || !password) { toast('Please enter your email and password'); return }

  const btn = event.target
  btn.textContent = 'Signing in…'
  btn.disabled = true

  const data = await api('/api/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

  btn.disabled = false
  btn.textContent = 'Sign in →'

  if (data.error) { toast(data.error); return }

  setSession(data.user, data.session.access_token, data.session.refresh_token, data.session.expires_at)
  launchDash(data.user.first_name || email.split('@')[0], data.user.last_name || '')
  checkSuccessParam()
}

async function doSignUp() {
  const first = document.getElementById('su-first').value.trim()
  const last = document.getElementById('su-last').value.trim()
  const email = document.getElementById('su-email').value.trim()
  const password = document.getElementById('su-pass').value
  const role = document.getElementById('su-role').value
  const subscribe = document.getElementById('su-nl').checked

  if (!first || !email || !password) { toast('Please fill in all required fields'); return }
  if (password.length < 8) { toast('Password must be at least 8 characters'); return }

  const btn = event.target
  btn.textContent = 'Creating account…'
  btn.disabled = true

  const data = await api('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email, password, first_name: first, last_name: last,
      role: role === 'list' ? 'landlord' : 'tenant',
      subscribe_newsletter: subscribe,
    }),
  })

  btn.disabled = false
  btn.textContent = 'Create my account →'

  if (data.error) { toast(data.error); return }
  toast('✓ Account created — you can sign in now', 'green')
  setTimeout(() => switchTab('in'), 2000)
}

async function doForgotPassword() {
  const email = document.querySelector('#form-forgot input[type=email]').value.trim()
  if (!email) { toast('Please enter your email address'); return }
  await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ email }) })
  toast('✓ Reset link sent if that email exists', 'green')
  setTimeout(() => switchTab('in'), 2000)
}

// ── PROFILE ──
async function loadProfile() {
  const data = await api('/api/users/me')
  if (data.error || !data.user) return
  const u = data.user
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || '' }
  set('p-instagram', u.instagram)
  set('p-linkedin', u.linkedin)
  set('p-airbnb', u.airbnb)
  set('p-viewing-url', u.viewing_url)
}

async function saveProfile() {
  const get = id => document.getElementById(id)?.value?.trim() || null
  const data = await api('/api/users/me', {
    method: 'PATCH',
    body: JSON.stringify({
      instagram: get('p-instagram'),
      linkedin: get('p-linkedin'),
      airbnb: get('p-airbnb'),
      viewing_url: get('p-viewing-url'),
    }),
  })
  if (data.error) { toast(data.error); return }
  toast('✓ Profile saved', 'green')
}

function signOut() {
  clearSession()
  document.getElementById('dash-screen').classList.remove('active')
  document.getElementById('dash-screen').style.display = 'none'
  document.getElementById('landing-screen').classList.add('active')
  document.getElementById('landing-screen').style.display = 'flex'
}

// ── SCREEN NAV ──
function goToBrowse() {
  const token = getToken()
  if (token) {
    window.location.href = '/listings'
  } else {
    showScreen('auth')
    switchTab('up')
  }
}
function goToPost() {
  const token = getToken()
  if (!token) {
    showScreen('auth')
    switchTab('up')
  } else {
    showScreen('dash')
    showPanel('post')
  }
}
function showScreen(name) {
  document.querySelectorAll('.screen, .landing-screen').forEach(s => {
    s.classList.remove('active')
    s.style.display = 'none'
  })
  const pubBrowse = document.getElementById('public-browse-screen')
  if (pubBrowse) pubBrowse.style.display = 'none'
  if (name === 'landing') {
    const el = document.getElementById('landing-screen')
    el.classList.add('active'); el.style.display = 'flex'
  } else if (name === 'auth') {
    const el = document.getElementById('auth-screen')
    el.classList.add('active'); el.style.display = 'flex'
  } else if (name === 'dash') {
    const el = document.getElementById('dash-screen')
    el.classList.add('active'); el.style.display = 'flex'
  } else if (name === 'browse') {
    const el = document.getElementById('browse-screen')
    if (el) { el.classList.add('active'); el.style.display = 'flex' }
  }
}

function launchDash(first, last) {
  document.getElementById('u-initials').textContent = ((first[0] || 'A') + (last[0] || first[1] || '')).toUpperCase()
  document.getElementById('u-name').textContent = first + (last ? ' ' + last[0] + '.' : '')
  document.getElementById('greeting-name').textContent = first

  const role = currentUser?.role || 'tenant'
  const isTenant = role === 'tenant'

  // Show admin badge and items if admin
  const adminBadge = document.getElementById('admin-badge')
  if (role === 'admin') {
    if (adminBadge) adminBadge.style.display = 'inline'
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = '')
  }

  // Swap overview panel based on role
  if (isTenant) {
    document.getElementById('overview-landlord').style.display = 'none'
    document.getElementById('overview-tenant').style.display = 'block'
    const nameEl = document.getElementById('greeting-name-tenant')
    if (nameEl) nameEl.textContent = first

    // Listings are always live
    document.getElementById('tenant-thursday-cta').style.display = 'block'
    document.getElementById('tenant-wait-cta').style.display = 'none'
    loadTenantMessages()
  }

  showScreen('dash')
  calcThursday()
  showPanel('overview')
  loadMyListings()
  loadEnquiries()
  if (role === 'admin') {
    loadSubscribers()
    loadPromos()
  }
}

// ── PANELS ──
const PANEL_MAP = {
  overview: 'si-overview', post: 'si-post', mylistings: 'si-listings',
  inbox: 'si-inbox', newsletter: 'si-nl', promos: 'si-promos',
  profile: 'si-profile', billing: 'si-billing', tenant: 'si-tenant',
}
const MOB_NAV_MAP = { overview: 'mob-overview', post: 'mob-post', mylistings: 'mob-listings', inbox: 'mob-inbox', profile: 'mob-profile' }
function showPanel(name) {
  document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.sb-item').forEach(b => b.classList.remove('active'))
  document.querySelectorAll('.mob-nav-btn').forEach(b => b.classList.remove('active'))
  const p = document.getElementById('panel-' + name)
  if (p) p.classList.add('active')
  const s = PANEL_MAP[name]
  if (s && document.getElementById(s)) document.getElementById(s).classList.add('active')
  const m = MOB_NAV_MAP[name]
  if (m && document.getElementById(m)) document.getElementById(m).classList.add('active')
  if (name === 'inbox') {
    const dot = document.getElementById('notif-dot')
    const badge = document.getElementById('inbox-badge')
    if (dot) dot.style.display = 'none'
    if (badge) badge.style.display = 'none'
    // Default to 'sent' tab for tenants, 'received' for landlords
    const defaultTab = (currentUser?.role === 'landlord' || currentUser?.role === 'admin') ? 'received' : 'sent'
    if (_activeMsgTab !== defaultTab) switchMsgTab(defaultTab)
    loadEnquiries()
  }
  if (name === 'mylistings') loadMyListings()
  if (name === 'post') resetPost()
  if (name === 'newsletter') loadNLListings()
  if (name === 'weeklistings') loadWeekListings()
  if (name === 'profile') loadProfile()
}

function switchMainTab(tab) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'))
  const el = document.getElementById('navt-' + tab)
  if (el) el.classList.add('active')
  if (tab === 'browse') {
    showScreen('browse')
    loadBrowseListings()
  } else {
    showPanel('overview')
  }
}

// ── THURSDAY COUNTDOWN ──
function calcThursday() {
  const now = new Date()
  const daysUntil = (4 - now.getDay() + 7) % 7 || 7
  const el = document.getElementById('days-until-thu')
  if (el) el.textContent = daysUntil
  const thu = new Date(now)
  thu.setDate(now.getDate() + daysUntil)
  const el2 = document.getElementById('nl-date-display')
  if (el2) el2.textContent = thu.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ═══ LISTINGS ═══

// ── POST A LISTING FLOW ──
const PLANS = {
  flatshare: { name: 'Flatshare', icon: '🏠', price: 0, label: 'Free', maxPhotos: 20 },
  rental: { name: 'Apartment Rental', icon: '🏢', price: 0, label: 'Free', maxPhotos: 20 },
  sublet: { name: 'Apartment Sublet', icon: '🌿', price: 0, label: 'Free', maxPhotos: 10 },
}

let currentTier = null
let photos = []
let uploadedPhotoUrls = []
let promoApplied = false

function selectTier(tier) {
  currentTier = tier
  photos = []
  uploadedPhotoUrls = []
  promoApplied = false
  const P = PLANS[tier]
  ;['flatshare', 'rental', 'sublet'].forEach(t => {
    const el = document.getElementById('tc-' + t)
    if (el) el.classList.remove('sel', 'sel-g')
  })
  const card = document.getElementById('tc-' + tier)
  if (card) card.classList.add('sel')

  const ftitle = document.getElementById('form-b-title')
  if (ftitle) ftitle.textContent = P.icon + ' ' + P.name + ' — Property details'

  const fprice = document.getElementById('f-price-lbl')
  if (fprice) fprice.textContent = 'Monthly rent (£)'

  const favail = document.getElementById('f-avail-lbl')
  if (favail) favail.textContent = tier === 'sublet' ? 'Sublet from' : 'Available from'

  const funtil = document.getElementById('f-until-wrap')
  if (funtil) funtil.style.display = tier === 'sublet' ? '' : 'none'

  const cmax = document.getElementById('c-max')
  if (cmax) cmax.textContent = P.maxPhotos

  goStep('b')
}

const STEPS = ['a', 'b', 'c', 'd', 'e']
function goStep(s) {
  STEPS.forEach(x => {
    const el = document.getElementById('ps' + x)
    if (el) el.style.display = x === s ? '' : 'none'
  })
  const idx = STEPS.indexOf(s) + 1
  for (let i = 1; i <= 5; i++) {
    const pb = document.getElementById('pb' + i)
    const ln = document.getElementById('pbl' + i)
    if (pb) {
      pb.classList.toggle('done', i < idx)
      pb.classList.toggle('active', i === idx)
      const dot = pb.querySelector('.pb-dot')
      if (dot) dot.textContent = i < idx ? '✓' : String(i)
    }
    if (ln) ln.classList.toggle('done', i < idx)
  }
  if (s === 'd') buildPaySummary()
  const main = document.querySelector('.dash-main')
  if (main) main.scrollTo({ top: 0, behavior: 'smooth' })
}

// ── PHOTOS ──
const MAX_PHOTO_MB = 5
function handleFiles(files) {
  const max = currentTier ? PLANS[currentTier].maxPhotos : 20
  const oversized = []
  Array.from(files).forEach(f => {
    if (f.size > MAX_PHOTO_MB * 1024 * 1024) {
      oversized.push(f.name)
    } else if (photos.length < max) {
      photos.push({ file: f, url: URL.createObjectURL(f) })
    }
  })
  if (oversized.length) {
    toast(`${oversized.length} photo${oversized.length > 1 ? 's' : ''} skipped — each photo must be under ${MAX_PHOTO_MB}MB. Try compressing them first.`)
  }
  renderPhotos()
}
function renderPhotos() {
  const max = currentTier ? PLANS[currentTier].maxPhotos : 20
  const grid = document.getElementById('photo-grid')
  if (!grid) return
  grid.innerHTML = photos.map((p, i) => `
    <div class="pthumb">
      <img src="${p.url}" alt="">
      <button class="del-btn" onclick="removePhoto(${i})">✕</button>
    </div>`).join('')
  const cnt = document.getElementById('photo-count-txt')
  if (cnt) cnt.textContent = `${photos.length} / ${max} photos added`
}
function removePhoto(i) { photos.splice(i, 1); renderPhotos() }
function dzOver(e) { e.preventDefault(); document.getElementById('dropzone')?.classList.add('drag') }
function dzLeave() { document.getElementById('dropzone')?.classList.remove('drag') }
function dzDrop(e) { e.preventDefault(); dzLeave(); handleFiles(e.dataTransfer.files) }

// ── PROMO CODE ──
async function applyPromo() {
  const code = document.getElementById('promo-input')?.value.trim().toUpperCase()
  const result = document.getElementById('promo-result')
  if (!code || !result) return

  const data = await api(`/api/promos?code=${encodeURIComponent(code)}`)
  if (data.valid) {
    const covers = data.discount_type === 'free-any' || data.discount_type === `free-${currentTier}`
    if (covers) {
      promoApplied = code
      result.textContent = '✓ Code applied — your listing is now free!'
      result.className = 'promo-result ok'
      result.style.display = 'block'
      const fpmsg = document.getElementById('free-path-msg')
      if (fpmsg) fpmsg.textContent = 'Promo code applied. Your listing will go live this Thursday when the newsletter sends.'
      buildPaySummary()
    } else {
      result.textContent = '✗ This code doesn\'t apply to ' + PLANS[currentTier]?.name + ' listings.'
      result.className = 'promo-result fail'
      result.style.display = 'block'
    }
  } else {
    result.textContent = '✗ ' + (data.error || 'Invalid or expired code.')
    result.className = 'promo-result fail'
    result.style.display = 'block'
  }
}

// ── PAY SUMMARY ──
function buildPaySummary() {
  const P = PLANS[currentTier]
  if (!P) return
  const title = document.getElementById('f-title')?.value || '(untitled)'
  const loc = document.getElementById('f-loc')?.value || '—'
  const price = document.getElementById('f-price')?.value
  const beds = document.getElementById('f-beds')?.value
  const baths = document.getElementById('f-baths')?.value
  const avail = document.getElementById('f-avail')?.value
  const bills = document.getElementById('f-bills')?.value
  const furn = document.getElementById('f-furn')?.value
  const desc = document.getElementById('f-desc')?.value
  const isFree = promoApplied
  const now = new Date()
  const dtu = (4 - now.getDay() + 7) % 7 || 7
  const thu = new Date(now)
  thu.setDate(now.getDate() + dtu)
  const thuStr = thu.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  const ptitle = document.getElementById('pay-title-h')
  if (ptitle) ptitle.textContent = isFree ? '✅ Review & publish' : '💳 Review & pay'

  const fp = document.getElementById('free-path')
  const pp = document.getElementById('paid-path')
  if (fp) fp.style.display = isFree ? '' : 'none'
  if (pp) pp.style.display = isFree ? 'none' : ''

  const ps = document.getElementById('promo-section')
  if (ps) ps.style.display = !promoApplied ? '' : 'none'

  const pba = document.getElementById('pay-btn-amt')
  if (!isFree && pba) pba.textContent = P.label

  const summary = document.getElementById('pay-summary')
  if (summary) {
    summary.innerHTML = `
      <div class="pay-row"><span class="pl">Listing type</span><span class="pv">${P.icon} ${P.name}</span></div>
      <div class="pay-row"><span class="pl">Title</span><span class="pv" style="max-width:230px;text-align:right;font-size:0.82rem">${title}</span></div>
      <div class="pay-row"><span class="pl">Location</span><span class="pv">${loc}</span></div>
      ${price ? `<div class="pay-row"><span class="pl">Monthly rent</span><span class="pv">£${price}/mo</span></div>` : ''}
      ${beds ? `<div class="pay-row"><span class="pl">Bedrooms</span><span class="pv">${beds}</span></div>` : ''}
      ${baths ? `<div class="pay-row"><span class="pl">Bathrooms</span><span class="pv">${baths}</span></div>` : ''}
      ${avail ? `<div class="pay-row"><span class="pl">Available from</span><span class="pv">${new Date(avail).toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric'})}</span></div>` : ''}
      ${bills ? `<div class="pay-row"><span class="pl">Bills</span><span class="pv">${bills}</span></div>` : ''}
      ${furn ? `<div class="pay-row"><span class="pl">Furnishing</span><span class="pv">${furn}</span></div>` : ''}
      ${desc ? `<div class="pay-row" style="align-items:flex-start"><span class="pl">Description</span><span class="pv" style="max-width:230px;text-align:right;font-size:0.82rem">${desc}</span></div>` : ''}
      <div class="pay-row"><span class="pl">Photos</span><span class="pv">${photos.length} uploaded</span></div>
      <div class="pay-row"><span class="pl">Duration</span><span class="pv">7 days</span></div>
      <div class="pay-row"><span class="pl">Goes live</span><span class="pv">${thuStr}</span></div>
      <div class="pay-row"><span class="pl">Newsletter debut</span><span class="pv">✓ Thursday edition</span></div>
      ${isFree ? `<div class="pay-row"><span class="pl">Promo code</span><span class="pv" style="color:var(--green)">${promoApplied} ✓</span></div>` : ''}
      <div class="pay-row total"><span class="pl">Total today</span><span class="pv ${isFree ? 'free' : ''}">${isFree ? 'Free' : P.label}${isFree ? `<span class="strike">${P.label}</span>` : ''}</span></div>`
  }
}

// ── PUBLISH LISTING ──
async function publishListing(btnEl) {
  await refreshTokenIfNeeded()
  const token = getToken()
  if (!token) { toast('Please sign in first'); return }

  const btn = btnEl || event?.target
  if (btn) { btn.disabled = true; btn.textContent = 'Processing…' }
  const resetBtn = () => { if (btn) { btn.disabled = false; btn.textContent = 'Confirm & schedule for Thursday →' } }

  try {
    // 1. Upload photos
    uploadedPhotoUrls = []
    for (let pi = 0; pi < photos.length; pi++) {
      const p = photos[pi]
      if (btn) btn.textContent = `Uploading photo ${pi + 1} of ${photos.length}…`
      const fd = new FormData()
      fd.append('file', p.file)
      let photoRes
      let lastErr
      for (let attempt = 1; attempt <= 3; attempt++) {
        const photoCtrl = new AbortController()
        const photoTimer = setTimeout(() => photoCtrl.abort(), 90000)
        try {
          photoRes = await fetch('/api/photos', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
            body: fd,
            signal: photoCtrl.signal,
          })
          clearTimeout(photoTimer)
          lastErr = null
          break
        } catch (err) {
          clearTimeout(photoTimer)
          lastErr = err
          if (attempt < 3) await new Promise(r => setTimeout(r, 2000))
        }
      }
      if (lastErr) {
        const msg = lastErr.name === 'AbortError' ? `Photo ${pi + 1} timed out. Check your connection and try again.` : 'Photo upload failed: ' + lastErr.message
        toast(msg)
        resetBtn()
        return
      }
      const data = await photoRes.json()
      if (data.error) { toast('Photo upload failed: ' + data.error); resetBtn(); return }
      if (data.url) uploadedPhotoUrls.push(data.url)
    }

    // 2. Create listing
    if (btn) btn.textContent = 'Saving listing…'
    const billsVal = document.getElementById('f-bills')?.value
    const furnVal = document.getElementById('f-furn')?.value
    const petVal = document.getElementById('f-pet')?.value
    const listingData = {
      type: currentTier,
      title: document.getElementById('f-title')?.value?.trim(),
      location: [document.getElementById('f-city')?.value, document.getElementById('f-loc')?.value?.trim()].filter(Boolean).join(', '),
      price: document.getElementById('f-price')?.value,
      beds: document.getElementById('f-beds')?.value,
      baths: document.getElementById('f-baths')?.value || null,
      bills_included: billsVal === 'Included',
      furnished: furnVal ? furnVal !== 'Unfurnished' : null,
      pet_friendly: petVal === 'Yes' ? true : petVal === 'No' ? false : null,
      description: document.getElementById('f-desc')?.value?.trim(),
      motto: document.getElementById('f-motto')?.value?.trim(),
      available_date: document.getElementById('f-avail')?.value,
      sublet_until: document.getElementById('f-until')?.value || null,
      spotify_url: document.getElementById('f-spotify')?.value?.trim(),
      instagram: document.getElementById('f-instagram')?.value?.trim(),
      linkedin: document.getElementById('f-linkedin')?.value?.trim(),
      airbnb: document.getElementById('f-airbnb')?.value?.trim(),
      photos: uploadedPhotoUrls,
      star_signs: getSelectedStarSigns(),
      music_vibes: getSelectedMusicVibes(),
    }

    const listingResult = await api('/api/listings', {
      method: 'POST',
      body: JSON.stringify(listingData),
    })

    if (listingResult.error || !listingResult.listing) {
      toast(listingResult.error || 'Failed to create listing. Please try again.')
      resetBtn()
      return
    }

    currentListingId = listingResult.listing.id

    resetBtn()
    showSuccessScreen(true)
    loadMyListings()
  } catch (err) {
    resetBtn()
    toast('Something went wrong: ' + (err.message || err))
  }
}

function showSuccessScreen(isFree) {
  const P = PLANS[currentTier]
  const now = new Date()
  const dtu = (4 - now.getDay() + 7) % 7 || 7
  const thu = new Date(now)
  thu.setDate(now.getDate() + dtu)
  const thuStr = thu.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const expStr = futureDate(dtu + 7)

  document.getElementById('s-icon').textContent = '📅'
  document.getElementById('s-title').textContent = 'Scheduled for Thursday!'
  document.getElementById('s-msg').textContent = `Your listing will go live on ${thuStr} when the newsletter sends.`
  document.getElementById('s-details').innerHTML = `
    <div class="sd-row"><span>Type</span><strong>${P.icon} ${P.name}</strong></div>
    <div class="sd-row"><span>Debuts</span><strong>${thuStr}</strong></div>
    <div class="sd-row"><span>Expires</span><strong>${expStr}</strong></div>
    ${isFree ? `<div class="sd-row"><span>Payment</span><strong>Promo code applied — free ✓</strong></div>` : `<div class="sd-row"><span>Payment</span><strong>${P.label} via Stripe ✓</strong></div>`}`
  goStep('e')
}

function resetPost() {
  currentTier = null; photos = []; uploadedPhotoUrls = []; promoApplied = false
  ;['flatshare', 'rental', 'sublet'].forEach(t => {
    const el = document.getElementById('tc-' + t)
    if (el) el.classList.remove('sel', 'sel-g')
  })
  const pr = document.getElementById('promo-result')
  if (pr) pr.style.display = 'none'
  const pi = document.getElementById('promo-input')
  if (pi) pi.value = ''
  goStep('a')
}

function futureDate(days) {
  const d = new Date(); d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── STAR SIGNS & MUSIC ──
function getSelectedStarSigns() {
  const checks = document.querySelectorAll('#landlord-stars input[type=checkbox]:checked')
  return Array.from(checks).map(c => c.value)
}
function getSelectedMusicVibes() {
  const checks = document.querySelectorAll('#music-taste input[type=checkbox]:checked')
  return Array.from(checks).map(c => c.value)
}
function toggleStarDropdown(id) {
  const el = document.getElementById(id)
  if (el) el.classList.toggle('open')
}
function updateStarLabel(id) {
  const checks = document.querySelectorAll(`#${id} input[type=checkbox]:checked`)
  const label = document.getElementById(id + '-label')
  if (!label) return
  if (checks.length === 0) label.textContent = 'Select star signs…'
  else label.textContent = Array.from(checks).map(c => c.value).join(', ')
}
function updateMusicLabel() {
  const checks = document.querySelectorAll('#music-taste input[type=checkbox]:checked')
  const label = document.getElementById('music-taste-label')
  if (!label) return
  if (checks.length === 0) label.textContent = 'Select music vibes…'
  else label.textContent = Array.from(checks).map(c => c.value).join(', ')
}

// ── MY LISTINGS ──
async function loadMyListings() {
  const token = getToken()
  if (!token) return
  const data = await api('/api/listings/mine')
  if (data.error || !data.listings) return

  const tbody = document.querySelector('#panel-mylistings table tbody')
  if (!tbody) return

  const typeIcon = { flatshare: '🏠', rental: '🏢', sublet: '🌿' }
  const statusBadge = {
    pending: '<span class="badge badge-thursday">📰 Thu debut</span>',
    active: '<span class="badge badge-live">● Live</span>',
    let: '<span class="badge badge-pending">Let</span>',
    expired: '<span class="badge badge-expired">Expired</span>',
  }

  if (data.listings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--light)">No listings yet — <a onclick="showPanel(\'post\')" style="color:var(--accent);cursor:pointer">post your first listing →</a></td></tr>'
    return
  }

  tbody.innerHTML = data.listings.map(l => `
    <tr>
      <td style="padding-left:1.4rem">
        <div style="display:flex;align-items:center;gap:0.7rem">
          <span style="font-size:1.3rem">${typeIcon[l.type] || '🏠'}</span>
          <div>
            <div style="font-weight:600;font-size:0.87rem">${l.title}</div>
            <div style="font-size:0.73rem;color:var(--light)">📍 ${l.location}</div>
          </div>
        </div>
      </td>
      <td><span class="badge badge-type">${typeIcon[l.type]} ${l.type}</span></td>
      <td>${statusBadge[l.status] || ''}</td>
      <td>💬 —</td>
      <td style="font-size:0.82rem;color:var(--mid)">${l.goes_live_at ? new Date(l.goes_live_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}</td>
      <td>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="openListing('${l.id}')">Preview</button>
          ${l.status !== 'expired' ? `<button class="btn btn-ghost btn-sm" onclick="editListing('${l.id}')">Edit</button>` : ''}
          ${l.status !== 'expired' ? `<button class="btn btn-ghost btn-sm" onclick="markAsLet('${l.id}')">Mark let</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="deleteListing('${l.id}')" style="color:#C0392B;border-color:#FADBD8">Delete</button>
        </div>
      </td>
    </tr>`).join('')
}

async function markAsLet(id) {
  const token = getToken()
  if (!token) return
  await api(`/api/listings/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'let' }) })
  toast('✓ Listing marked as let', 'green')
  loadMyListings()
}

async function deleteListing(id) {
  if (!confirm('Delete this listing? This cannot be undone.')) return
  const token = getToken()
  if (!token) return
  const data = await api(`/api/listings/${id}`, { method: 'DELETE' })
  if (data.error) { toast(data.error); return }
  toast('Listing deleted')
  loadMyListings()
}

let _editingListingId = null

function updateElStarLabel() {
  const checks = document.querySelectorAll('#el-stars input:checked')
  const label = document.getElementById('el-stars-label')
  if (label) label.textContent = checks.length ? Array.from(checks).map(c => c.value).join(', ') : 'Select star signs…'
}

function updateElMusicLabel() {
  const checks = document.querySelectorAll('#el-music input:checked')
  const label = document.getElementById('el-music-label')
  if (label) label.textContent = checks.length ? Array.from(checks).map(c => c.value).join(', ') : 'Select music vibes…'
}

async function editListing(id) {
  const data = await api(`/api/listings/${id}`)
  if (data.error) { toast('Could not load listing'); return }
  const l = data.listing
  _editingListingId = id

  document.getElementById('el-title').value = l.title || ''
  document.getElementById('el-location').value = l.location || ''
  document.getElementById('el-price').value = l.price ? Math.round(l.price / 100) : ''
  document.getElementById('el-beds').value = l.beds || ''
  document.getElementById('el-baths').value = l.baths || ''
  document.getElementById('el-bills').value = l.bills_included ? 'Included' : 'Not included'
  document.getElementById('el-furn').value = l.furnished === true ? 'Furnished' : l.furnished === false ? 'Unfurnished' : ''
  document.getElementById('el-pet').value = l.pet_friendly === true ? 'Yes' : l.pet_friendly === false ? 'No' : ''
  document.getElementById('el-desc').value = l.description || ''
  document.getElementById('el-motto').value = l.motto || ''
  document.getElementById('el-avail').value = l.available_date || ''
  document.getElementById('el-spotify').value = l.spotify_url || ''

  // Star signs
  document.querySelectorAll('#el-stars input[type=checkbox]').forEach(cb => {
    cb.checked = (l.star_signs || []).includes(cb.value)
  })
  updateElStarLabel()

  // Music vibes
  document.querySelectorAll('#el-music input[type=checkbox]').forEach(cb => {
    cb.checked = (l.music_vibes || []).includes(cb.value)
  })
  updateElMusicLabel()

  document.getElementById('listing-edit-modal').style.display = 'flex'
}

async function saveListingEdit() {
  if (!_editingListingId) return
  const btn = document.getElementById('el-save-btn')
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…' }

  const billsVal = document.getElementById('el-bills').value
  const furnVal = document.getElementById('el-furn').value
  const petVal = document.getElementById('el-pet').value
  const updates = {
    title: document.getElementById('el-title').value.trim(),
    location: document.getElementById('el-location').value.trim(),
    price: document.getElementById('el-price').value ? Math.round(parseFloat(document.getElementById('el-price').value) * 100) : null,
    beds: document.getElementById('el-beds').value,
    baths: document.getElementById('el-baths').value || null,
    bills_included: billsVal === 'Included' ? true : billsVal === 'Not included' ? false : null,
    furnished: furnVal === 'Furnished' ? true : furnVal === 'Unfurnished' ? false : furnVal === 'Part furnished' ? true : null,
    pet_friendly: petVal === 'Yes' ? true : petVal === 'No' ? false : null,
    description: document.getElementById('el-desc').value.trim(),
    motto: document.getElementById('el-motto').value.trim(),
    available_date: document.getElementById('el-avail').value || null,
    spotify_url: document.getElementById('el-spotify').value.trim() || null,
    star_signs: Array.from(document.querySelectorAll('#el-stars input:checked')).map(c => c.value),
    music_vibes: Array.from(document.querySelectorAll('#el-music input:checked')).map(c => c.value),
  }

  if (!updates.title || !updates.location) {
    toast('Title and location are required')
    if (btn) { btn.disabled = false; btn.textContent = 'Save changes →' }
    return
  }

  const data = await api(`/api/listings/${_editingListingId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
  if (btn) { btn.disabled = false; btn.textContent = 'Save changes →' }
  if (data.error) { toast(data.error); return }

  document.getElementById('listing-edit-modal').style.display = 'none'
  toast('✓ Listing updated', 'green')
  loadMyListings()
}

// ── CHAT / MESSAGES ──
let _sentEnquiries = []      // enquiries this user sent as a tenant
let _receivedEnquiries = []  // enquiries this user received as a landlord
let _activeMsgTab = 'sent'
let _activeEnquiryId = null

function currentTabEnquiries() {
  return _activeMsgTab === 'sent' ? _sentEnquiries : _receivedEnquiries
}

async function loadEnquiries() {
  const token = getToken()
  if (!token) return
  const data = await api('/api/enquiries')
  if (data.error) return

  _sentEnquiries = data.sent || []
  _receivedEnquiries = data.received || []

  // Badge: unread received enquiries
  const unread = _receivedEnquiries.filter(e => !e.read).length
  const badge = document.getElementById('inbox-badge')
  if (badge) { badge.textContent = unread; badge.style.display = unread > 0 ? '' : 'none' }
  const dot = document.getElementById('notif-dot')
  if (dot) dot.style.display = unread > 0 ? '' : 'none'
  const mobDot = document.getElementById('mob-notif-dot')
  if (mobDot) mobDot.style.display = unread > 0 ? '' : 'none'

  renderConvList()
}

async function loadTenantMessages() {
  const token = getToken()
  if (!token) return
  const data = await api('/api/enquiries')
  const wrap = document.getElementById('tenant-messages-wrap')
  const openBtn = document.getElementById('tenant-messages-open-btn')
  if (!wrap) return

  _sentEnquiries = data.sent || []
  _receivedEnquiries = data.received || []

  if (openBtn) openBtn.style.display = 'none'

  if (_sentEnquiries.length === 0) {
    wrap.innerHTML = '<div style="padding:1rem;color:var(--light);font-size:0.86rem">No messages yet — browse listings and message landlords directly.</div>'
    return
  }

  wrap.innerHTML = _sentEnquiries.map(e => {
    const listing = e.listing || {}
    const landlord = e.landlord || {}
    const landlordName = `${landlord.first_name || ''} ${landlord.last_name || ''}`.trim() || 'Landlord'
    const timeStr = formatTimeAgo(e.created_at)
    return `
      <div class="inbox-item" onclick="openOverviewThread('${e.id}')" style="cursor:pointer">
        <div class="i-avatar" style="background:linear-gradient(135deg,#f7b188,#c4856a);flex-shrink:0">🏠</div>
        <div class="i-body">
          <div class="i-head"><span class="i-name">${escapeHtml(listing.title || 'Listing')}</span><span class="i-time">${timeStr}</span></div>
          <div class="i-listing">Landlord: ${escapeHtml(landlordName)}</div>
          <div class="i-preview">${escapeHtml(e.message || '')}</div>
        </div>
        <div style="color:var(--accent);font-size:0.78rem;flex-shrink:0;align-self:center">Open →</div>
      </div>`
  }).join('')
}

function openOverviewThread(enquiryId) {
  // Switch to inbox panel directly (avoid async race from showPanel)
  _activeMsgTab = 'sent'
  document.querySelectorAll('.dash-panel').forEach(p => { p.classList.remove('active'); p.style.display = '' })
  document.querySelectorAll('.sb-item').forEach(b => b.classList.remove('active'))
  const panel = document.getElementById('panel-inbox')
  if (panel) { panel.classList.add('active'); panel.style.display = 'block' }
  const sideBtn = document.getElementById('si-inbox')
  if (sideBtn) sideBtn.classList.add('active')
  // Ensure tab UI is correct
  const st = document.getElementById('msgtab-sent')
  const rt = document.getElementById('msgtab-received')
  if (st) st.classList.add('active')
  if (rt) rt.classList.remove('active')
  // Data already in _sentEnquiries — open thread immediately
  openChatThread(enquiryId)
}

function switchMsgTab(tab) {
  _activeMsgTab = tab
  _activeEnquiryId = null
  document.getElementById('msgtab-sent').classList.toggle('active', tab === 'sent')
  document.getElementById('msgtab-received').classList.toggle('active', tab === 'received')
  const header = document.getElementById('chat-list-header')
  if (header) header.textContent = tab === 'sent' ? 'Messages to landlords' : 'Messages from tenants'
  // Reset thread
  const noSel = document.getElementById('chat-no-select')
  const inner = document.getElementById('chat-thread-inner')
  if (noSel) noSel.style.display = ''
  if (inner) inner.style.display = 'none'
  document.getElementById('chat-conv-list').classList.remove('thread-open')
  renderConvList()
}

function renderConvList() {
  const list = document.getElementById('chat-conv-list')
  if (!list) return

  const enquiries = currentTabEnquiries()
  const headerText = _activeMsgTab === 'sent' ? 'Messages to landlords' : 'Messages from tenants'
  const emptyText = _activeMsgTab === 'sent' ? 'No messages sent yet.' : 'No enquiries about your listings yet.'

  if (enquiries.length === 0) {
    list.innerHTML = `<div class="chat-list-header">${headerText}</div><div style="padding:2rem;text-align:center;color:var(--light);font-size:0.86rem">${emptyText}</div>`
    return
  }

  // In sent tab, show landlord name. In received tab, show tenant name.
  const showLandlord = _activeMsgTab === 'sent'

  list.innerHTML = `<div class="chat-list-header">${headerText}</div>` + enquiries.map(e => {
    const other = showLandlord ? (e.landlord || {}) : (e.tenant || {})
    const name = `${other.first_name || ''} ${other.last_name || ''}`.trim() || 'Housefolk user'
    const initials = (name[0] || '?').toUpperCase()
    const listing = e.listing || {}
    const preview = e.message || ''
    const timeStr = formatTimeAgo(e.created_at)
    const isActive = e.id === _activeEnquiryId
    const isUnread = !e.read
    return `
      <div class="chat-conv-item ${isActive ? 'active' : ''} ${isUnread ? 'unread' : ''}" onclick="openChatThread('${e.id}')">
        <div class="i-avatar" style="background:linear-gradient(135deg,#4A90D9,#7B68EE);width:34px;height:34px;font-size:0.75rem;flex-shrink:0">${initials}</div>
        <div class="chat-conv-meta">
          <div class="chat-conv-name">${name}</div>
          <div class="chat-conv-listing">Re: ${listing.title || 'Listing'}</div>
          <div class="chat-conv-preview">${escapeHtml(preview)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.3rem">
          <div class="chat-conv-time">${timeStr}</div>
          ${isUnread ? '<div class="chat-unread-dot"></div>' : ''}
        </div>
      </div>`
  }).join('')
}

async function openChatThread(enquiryId) {
  _activeEnquiryId = enquiryId
  renderConvList()

  const enquiry = currentTabEnquiries().find(e => e.id === enquiryId)
  if (!enquiry) return

  const role = currentUser?.role || 'tenant'
  const isLandlord = role === 'landlord' || role === 'admin'
  const other = isLandlord ? (enquiry.tenant || {}) : (enquiry.landlord || {})
  const otherName = `${other.first_name || ''} ${other.last_name || ''}`.trim() || 'Housefolk user'
  const listing = enquiry.listing || {}

  document.getElementById('chat-no-select').style.display = 'none'
  const inner = document.getElementById('chat-thread-inner')
  inner.style.display = 'flex'
  document.getElementById('chat-thread-name').textContent = otherName
  const listingLink = listing.id ? `<a href="/listings/${listing.id}">${listing.title || 'Listing'} →</a>` : (listing.title || 'Listing')
  document.getElementById('chat-thread-sub').innerHTML = listingLink

  // Book viewing button — show if landlord has a viewing URL
  const bookBtn = document.getElementById('chat-book-btn')
  if (bookBtn) {
    // Only show Book viewing button in sent tab (tenant booking landlord's link)
    const viewingUrl = _activeMsgTab === 'sent' ? (enquiry.landlord?.viewing_url || '') : ''
    if (viewingUrl) {
      bookBtn.href = viewingUrl
      bookBtn.style.display = ''
    } else {
      bookBtn.style.display = 'none'
    }
  }

  // Show "Suggest time" button only for landlords in received tab
  const suggestBtn = document.getElementById('chat-suggest-btn')
  const suggestRow = document.getElementById('chat-suggest-row')
  const isLandlordThread = _activeMsgTab === 'received'
  if (suggestBtn) suggestBtn.style.display = isLandlordThread ? '' : 'none'
  if (suggestRow) suggestRow.style.display = 'none' // always collapsed on open

  // Mobile: hide conv list, show thread
  document.getElementById('chat-conv-list').classList.add('thread-open')

  const msgList = document.getElementById('chat-messages-list')
  msgList.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--light);font-size:0.82rem">Loading…</div>'

  const data = await api(`/api/enquiries/${enquiryId}/messages`)

  // Always show at least the original enquiry message as the first bubble
  const tenantId = enquiry.tenant_id || enquiry.tenant?.id
  const seedBubble = renderMessageBubble({
    id: 'seed',
    body: enquiry.message,
    created_at: enquiry.created_at,
    sender_id: tenantId,
  })

  const allMessages = data.messages || []
  if (allMessages.length === 0) {
    msgList.innerHTML = seedBubble
  } else {
    msgList.innerHTML = seedBubble + allMessages.map(m => renderMessageBubble(m)).join('')
  }

  msgList.scrollTop = msgList.scrollHeight
  document.getElementById('chat-reply-input').focus()
}

function renderMessageBubble(m) {
  const isSent = m.sender_id === currentUser?.id
  const timeStr = formatTimeAgo(m.created_at)
  return `<div class="chat-bubble-wrap ${isSent ? 'sent' : 'received'}">
    <div class="chat-bubble">${escapeHtml(m.body)}</div>
    <div class="chat-bubble-time">${timeStr}</div>
  </div>`
}

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

async function sendChatMessage() {
  if (!_activeEnquiryId) return
  const input = document.getElementById('chat-reply-input')
  const body = input?.value?.trim()
  if (!body) return

  const btn = document.querySelector('.chat-send-btn')
  if (btn) btn.disabled = true
  const data = await api(`/api/enquiries/${_activeEnquiryId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
  if (btn) btn.disabled = false

  if (data.error) { toast(data.error); return }

  input.value = ''
  input.style.height = ''
  // Append bubble optimistically
  const msgList = document.getElementById('chat-messages-list')
  if (msgList) {
    msgList.insertAdjacentHTML('beforeend', renderMessageBubble({
      id: data.message?.id || Date.now(),
      body,
      created_at: new Date().toISOString(),
      sender_id: currentUser?.id,
    }))
    msgList.scrollTop = msgList.scrollHeight
  }
  // Update preview in conversation list
  const eq = currentTabEnquiries().find(e => e.id === _activeEnquiryId)
  if (eq) eq.last_message = { body, created_at: new Date().toISOString(), sender_id: currentUser?.id }
  renderConvList()
}

function closeChatThread() {
  _activeEnquiryId = null
  document.getElementById('chat-conv-list').classList.remove('thread-open')
  document.getElementById('chat-no-select').style.display = ''
  document.getElementById('chat-thread-inner').style.display = 'none'
  renderConvList()
}

function toggleSuggestRow() {
  const row = document.getElementById('chat-suggest-row')
  if (!row) return
  const visible = row.style.display === 'flex'
  row.style.display = visible ? 'none' : 'flex'
  if (!visible) {
    // Default date to tomorrow
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    const iso = tomorrow.toISOString().split('T')[0]
    const dateEl = document.getElementById('chat-suggest-date')
    if (dateEl && !dateEl.value) dateEl.value = iso
  }
}

async function sendViewingSuggestion() {
  const dateEl = document.getElementById('chat-suggest-date')
  const timeEl = document.getElementById('chat-suggest-time')
  const date = dateEl?.value
  const time = timeEl?.value
  if (!date) { toast('Please pick a date'); return }

  const formatted = new Date(`${date}T${time || '10:00'}`).toLocaleString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
  })
  const body = `📅 Viewing suggestion: ${formatted}`

  const btn = document.querySelector('#chat-suggest-row .chat-send-btn')
  if (btn) btn.disabled = true
  const data = await api(`/api/enquiries/${_activeEnquiryId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
  if (btn) btn.disabled = false
  if (data.error) { toast(data.error); return }

  // Hide the suggester row
  document.getElementById('chat-suggest-row').style.display = 'none'
  dateEl.value = ''

  // Append bubble
  const msgList = document.getElementById('chat-messages-list')
  if (msgList) {
    msgList.insertAdjacentHTML('beforeend', renderMessageBubble({
      id: data.message?.id || Date.now(),
      body,
      created_at: new Date().toISOString(),
      sender_id: currentUser?.id,
    }))
    msgList.scrollTop = msgList.scrollHeight
  }
}

function chatInputKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage() }
}

function autoResizeChatInput(el) {
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

function formatTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'Just now'
  if (h < 24) return h + 'h ago'
  return Math.floor(h / 24) + 'd ago'
}

// ── BROWSE LISTINGS ──
async function loadBrowseListings(type = '', location = '') {
  const grid = document.getElementById('listing-grid')
  if (!grid) return
  grid.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--light)">Loading listings…</div>'

  let url = '/api/listings'
  const params = []
  if (type) params.push(`type=${encodeURIComponent(type)}`)
  if (location) params.push(`location=${encodeURIComponent(location)}`)
  if (params.length) url += '?' + params.join('&')

  const data = await api(url)
  if (data.error || !data.listings) {
    grid.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--light)">No listings found.</div>'
    return
  }

  const typeIcon = { flatshare: '🏠', rental: '🏢', sublet: '🌿' }
  const isLoggedIn = !!currentUser

  if (data.listings.length === 0) {
    grid.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--light)">No listings available right now. Check back Thursday!</div>'
    return
  }

  grid.innerHTML = data.listings.map(l => {
    const priceStr = l.price ? `£${Math.round(l.price / 100).toLocaleString()}<span>/mo</span>` : 'Free sublet'
    const photo = l.photos?.[0]
    return `
      <div class="listing-card" onclick="window.location.href='/listings/${l.id}'" style="cursor:pointer">
        <div class="lc-photo">
          ${photo ? `<img src="${photo}" alt="${l.title}">` : `<div class="lc-photo-placeholder">${typeIcon[l.type] || '🏠'}</div>`}
          <span class="lc-type-badge">${typeIcon[l.type]} ${l.type}</span>
        </div>
        <div class="lc-body">
          <div class="lc-price">${priceStr}</div>
          <div class="lc-title">${l.title}</div>
          <div class="lc-location">📍 ${l.location}</div>
          <div class="lc-meta">
            ${l.beds ? `<span class="lc-tag">🛏 ${l.beds} bed</span>` : ''}
            ${l.baths ? `<span class="lc-tag">🚿 ${l.baths} bath</span>` : ''}
            ${l.bills_included ? '<span class="lc-tag">Bills incl.</span>' : ''}
          </div>
          ${l.description ? `<div class="lc-desc">${l.description}</div>` : ''}
          <div class="lc-footer">
            <span class="lc-avail">${l.available_date ? 'From ' + new Date(l.available_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Available now'}</span>
            ${isLoggedIn
              ? `<button class="lc-contact-btn" onclick="event.stopPropagation();openEnquiryModal('${l.id}','${l.title}')">Message →</button>`
              : `<button class="lc-locked-btn" onclick="event.stopPropagation();showScreen('auth');switchTab('up')">Sign up to message →</button>`}
          </div>
        </div>
      </div>`
  }).join('')
}

async function openListing(id) {
  const modal = document.getElementById('listing-detail-modal')
  if (!modal) return
  modal.style.display = 'flex'
  document.getElementById('detail-photo').innerHTML = '<span style="font-size:4rem;opacity:0.3">⏳</span>'
  document.getElementById('detail-title').textContent = 'Loading…'
  document.getElementById('detail-location').textContent = ''
  document.getElementById('detail-price').textContent = ''
  document.getElementById('detail-meta').innerHTML = ''
  document.getElementById('detail-motto').textContent = ''
  document.getElementById('detail-desc').textContent = ''
  document.getElementById('detail-grid').innerHTML = ''
  document.getElementById('detail-contact-wrap').innerHTML = ''
  const ds = document.getElementById('detail-stars'); if (ds) { ds.innerHTML = ''; ds.style.display = 'none' }
  const dm = document.getElementById('detail-music'); if (dm) { dm.innerHTML = ''; dm.style.display = 'none' }

  const data = await api(`/api/listings/${id}`)
  if (data.error) { closeListing(); toast('Could not load listing'); return }
  const l = data.listing
  const typeIcon = { flatshare: '🏠', rental: '🏢', sublet: '🌿' }

  // Photo
  const photoEl = document.getElementById('detail-photo')
  if (l.photos && l.photos.length > 0) {
    photoEl.style.backgroundImage = `url(${l.photos[0]})`
    photoEl.style.backgroundSize = 'cover'
    photoEl.style.backgroundPosition = 'center'
    photoEl.innerHTML = `
      <div style="position:absolute;top:1rem;right:1rem;display:flex;gap:0.5rem">
        <button onclick="closeListing()" style="background:rgba(255,255,255,0.9);border:none;border-radius:50%;width:38px;height:38px;cursor:pointer;font-size:0.9rem;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.15)">✕</button>
      </div>
      <div style="position:absolute;top:1rem;left:1rem" id="detail-type-badge"></div>`
  } else {
    photoEl.style.backgroundImage = ''
    photoEl.innerHTML = `
      <span style="font-size:5rem">${typeIcon[l.type] || '🏠'}</span>
      <div style="position:absolute;top:1rem;right:1rem">
        <button onclick="closeListing()" style="background:rgba(255,255,255,0.9);border:none;border-radius:50%;width:38px;height:38px;cursor:pointer;font-size:0.9rem;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.15)">✕</button>
      </div>`
  }

  // Type badge
  const badgeEl = document.getElementById('detail-type-badge')
  if (badgeEl) badgeEl.innerHTML = `<span class="badge badge-type">${typeIcon[l.type] || ''} ${l.type}</span>`

  document.getElementById('detail-title').textContent = l.title || ''
  document.getElementById('detail-location').textContent = l.location ? `📍 ${l.location}` : ''
  document.getElementById('detail-price').textContent = l.price ? `£${Math.round(l.price / 100).toLocaleString()}/mo` : ''

  const meta = []
  if (l.beds) meta.push(`🛏 ${l.beds} bed${l.beds === '1' ? '' : 's'}`)
  if (l.baths) meta.push(`🚿 ${l.baths} bath${l.baths === '1' ? '' : 's'}`)
  if (l.furnished === true) meta.push('🛋️ Furnished')
  if (l.furnished === false) meta.push('🛋️ Unfurnished')
  if (l.pet_friendly === true) meta.push('🐾 Pets welcome')
  if (l.pet_friendly === false) meta.push('🚫 No pets')
  if (l.bills_included) meta.push('💡 Bills included')
  if (l.available_date) meta.push(`📅 Available ${new Date(l.available_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`)
  document.getElementById('detail-meta').innerHTML = meta.map(m => `<span class="badge badge-type" style="font-size:0.78rem">${m}</span>`).join('')

  // Star signs
  const starsEl = document.getElementById('detail-stars')
  if (starsEl) {
    starsEl.style.display = l.star_signs?.length ? '' : 'none'
    starsEl.innerHTML = l.star_signs?.length ? `<div style="font-size:0.78rem;color:var(--mid);margin-bottom:0.4rem;font-weight:600">Looking for</div><div style="display:flex;flex-wrap:wrap;gap:0.3rem">${l.star_signs.map(s => `<span class="badge badge-type" style="font-size:0.78rem">✨ ${s}</span>`).join('')}</div>` : ''
  }

  // Music vibes
  const musicEl = document.getElementById('detail-music')
  if (musicEl) {
    musicEl.style.display = l.music_vibes?.length ? '' : 'none'
    musicEl.innerHTML = l.music_vibes?.length ? `<div style="font-size:0.78rem;color:var(--mid);margin-bottom:0.4rem;font-weight:600">Music vibe</div><div style="display:flex;flex-wrap:wrap;gap:0.3rem">${l.music_vibes.map(v => `<span class="badge badge-type" style="font-size:0.78rem">🎵 ${v}</span>`).join('')}</div>` : ''
  }

  document.getElementById('detail-motto').textContent = l.motto || ''
  document.getElementById('detail-motto').style.display = l.motto ? '' : 'none'
  document.getElementById('detail-desc').textContent = l.description || ''

  // Status info
  const statusLabel = { pending: '📰 Scheduled for Thursday', active: '● Live', let: 'Let', expired: 'Expired' }
  document.getElementById('detail-grid').innerHTML = `
    <div style="font-size:0.8rem;color:var(--mid)">Status</div><div style="font-size:0.85rem;font-weight:600">${statusLabel[l.status] || l.status}</div>
    ${l.goes_live_at ? `<div style="font-size:0.8rem;color:var(--mid)">Goes live</div><div style="font-size:0.85rem;font-weight:600">${new Date(l.goes_live_at).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })}</div>` : ''}
    ${l.spotify_url ? `<div style="font-size:0.8rem;color:var(--mid)">Spotify</div><div style="font-size:0.85rem"><a href="${l.spotify_url}" target="_blank" style="color:var(--accent)">🎵 Playlist</a></div>` : ''}`

  // Contact wrap — show enquiry button if logged in and not own listing
  const contactWrap = document.getElementById('detail-contact-wrap')
  if (currentUser && l.landlord_id !== currentUser.id) {
    contactWrap.innerHTML = `<button class="btn btn-primary" style="width:100%" onclick="openEnquiryModal('${l.id}', ${JSON.stringify(l.title)})">Message landlord →</button>`
  } else {
    contactWrap.innerHTML = ''
  }
}

function closeListing() {
  const modal = document.getElementById('listing-detail-modal')
  if (modal) modal.style.display = 'none'
}

function showUnlockModal() {
  const modal = document.getElementById('unlock-modal')
  if (modal) modal.style.display = 'flex'
}

function pubUnlockContacts() {
  document.getElementById('pub-unlock-modal').style.display = 'none'
  showScreen('auth')
  switchTab('up')
}
function showPubUnlockModal() {
  // Take unauthenticated users straight to sign-up
  showScreen('auth')
  switchTab('up')
}

function closeUnlockModal() {
  const modal = document.getElementById('unlock-modal')
  if (modal) modal.style.display = 'none'
}

async function startTenantSubscription() {
  const token = getToken()
  if (!token) {
    const m = document.getElementById('unlock-modal')
    if (m) m.style.display = 'none'
    showScreen('auth')
    return
  }
  const data = await api('/api/checkout/tenant', { method: 'POST' })
  if (data.url) window.location.href = data.url
  else toast(data.error || 'Something went wrong')
}

let _enquiryListingId = null

function openEnquiryModal(listingId, listingTitle) {
  if (!getToken()) { showScreen('auth'); switchTab('up'); return }
  _enquiryListingId = listingId
  const titleEl = document.getElementById('contact-listing-title')
  if (titleEl) titleEl.textContent = listingTitle || 'Contact landlord'
  const msgEl = document.getElementById('contact-message')
  if (msgEl) msgEl.value = ''
  const modal = document.getElementById('contact-modal')
  if (modal) modal.style.display = 'flex'
}

async function sendEnquiry() {
  const token = getToken()
  if (!token) { showScreen('auth'); return }
  const message = document.getElementById('contact-message')?.value?.trim()
  if (!message) { toast('Please write a message first'); return }
  const btn = document.querySelector('#contact-modal .btn-primary')
  const orig = btn?.textContent
  if (btn) btn.textContent = 'Sending…'
  const data = await api('/api/enquiries', {
    method: 'POST',
    body: JSON.stringify({ listing_id: _enquiryListingId, message }),
  })
  if (btn) btn.textContent = orig
  if (data.error) { toast(data.error); return }
  document.getElementById('contact-modal').style.display = 'none'
  toast('✓ Message sent to landlord')
  loadTenantMessages()
}

function searchListings() {
  const location = document.getElementById('browse-location')?.value
  const type = document.getElementById('browse-type')?.value
  loadBrowseListings(type, location)
}

function filterTab(type) {
  document.querySelectorAll('.listing-tab').forEach(t => t.classList.remove('active'))
  event.target.classList.add('active')
  loadBrowseListings(type)
}

// ── LANDING PREVIEW ──
async function loadLandingPreview() {
  const grid = document.getElementById('landing-preview-grid')
  if (!grid) return
  const data = await api('/api/listings?limit=3')
  if (!data.listings?.length) return

  const typeIcon = { flatshare: '🏠', rental: '🏢', sublet: '🌿' }
  grid.innerHTML = data.listings.slice(0, 3).map(l => {
    const priceStr = l.price ? `£${Math.round(l.price / 100).toLocaleString()}/mo` : 'Free sublet'
    const photo = l.photos?.[0]
    return `
      <div class="listing-card preview-blur" style="cursor:default">
        <div class="lc-photo">
          ${photo ? `<img src="${photo}" alt="${l.title}">` : `<div class="lc-photo-placeholder">${typeIcon[l.type]}</div>`}
          <span class="lc-type-badge">${typeIcon[l.type]} ${l.type}</span>
        </div>
        <div class="lc-body">
          <div class="lc-price">${priceStr}</div>
          <div class="lc-title">${l.title}</div>
          <div class="lc-location">📍 ${l.location}</div>
        </div>
      </div>`
  }).join('')
}

// ══ NEWSLETTER ══

function nlTab(tab) {
  ;['compose', 'subscribers', 'history'].forEach(t => {
    const el = document.getElementById('nl-tab-' + t)
    if (el) el.style.display = t === tab ? '' : 'none'
    const btn = document.getElementById('nlt-' + t)
    if (btn) btn.classList.toggle('active', t === tab)
  })
  if (tab === 'subscribers') loadSubscribers()
}

function insertSnippet(type) {
  const ta = document.getElementById('nl-intro')
  if (!ta) return
  const snippets = {
    greeting: 'Hi everyone,\n\nWelcome to this week\'s Housefolk newsletter! We\'re so glad you\'re here.\n\nHappy house hunting! 🏡\n\nThe Housefolk team',
    cta: '\n\n👉 Know someone looking for a home? Share this newsletter with them — it really helps.\n\nSee you next Thursday!',
    seasonal: '\n\n🌸 Spring is the perfect time to move. Whether you\'re looking for a flatshare, rental or subletting your place, now is the moment to act.\n\nThe Housefolk team',
    tip: '\n\n💡 Tip of the week: Listings with 10+ photos get 3× more enquiries. Make sure your photos show natural light and every room!\n\nThe Housefolk team',
  }
  if (snippets[type]) {
    ta.value += (ta.value ? '\n' : '') + snippets[type]
    const cnt = document.getElementById('nl-char-count')
    if (cnt) cnt.textContent = ta.value.length + ' characters'
  }
}

function previewNL() {
  const intro = document.getElementById('nl-intro')?.value || 'Hi everyone,\n\nWelcome to this week\'s Housefolk listings.\n\nHappy house hunting! 🏡'
  const subject = document.getElementById('nl-subject')?.value || 'New listings this Thursday'
  const wrap = document.getElementById('nl-preview-wrap')
  const content = document.getElementById('nl-preview-content')
  if (!wrap || !content) return

  content.innerHTML = `
    <div class="nl-header">
      <div class="nl-header-logo">home<span>folk</span></div>
      <p style="font-size:0.78rem;color:#7A6E62;margin-top:0.2rem">Weekly listings newsletter</p>
      <p style="font-size:0.74rem;color:#5A5048;margin-top:0.1rem">Subject: ${subject}</p>
    </div>
    <div class="nl-body">
      <div class="nl-intro-box">${intro.replace(/\n/g, '<br>')}</div>
      <div class="nl-section-title">🏠 This week's new listings</div>
      <p style="color:var(--light);font-size:0.82rem">Active listings will appear here when the newsletter sends.</p>
    </div>
    <div class="nl-footer">Housefolk · You're receiving this because you subscribed · <span style="color:var(--accent-light)">Unsubscribe</span></div>`
  wrap.style.display = ''
  wrap.scrollIntoView({ behavior: 'smooth' })
}

function saveNLDraft() { toast('✓ Draft saved', 'green') }

async function loadWeekListings() {
  const grid = document.getElementById('weeklistings-grid')
  if (!grid) return
  grid.innerHTML = '<div style="color:var(--light);font-size:0.85rem;padding:0.5rem 0">Loading…</div>'
  const data = await api('/api/listings')
  if (!data.listings || data.listings.length === 0) {
    grid.innerHTML = '<div style="color:var(--light);font-size:0.85rem;padding:0.5rem 0">No active listings this week.</div>'
    return
  }
  const typeIcon = { flatshare: '🏠', rental: '🏢', sublet: '🌿' }
  grid.innerHTML = data.listings.map(l => {
    const price = l.price ? `£${Math.round(l.price / 100)}/mo` : 'Free'
    const icon = typeIcon[l.type] || '🏠'
    const type = l.type ? l.type.charAt(0).toUpperCase() + l.type.slice(1) : ''
    const avail = l.available_date ? new Date(l.available_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
    return `<div class="fcard" style="padding:1rem 1.2rem">
      <div style="display:flex;align-items:center;gap:0.8rem">
        <span style="font-size:1.4rem">${icon}</span>
        <div style="flex:1">
          <div style="font-weight:600;font-size:0.9rem">${l.title}</div>
          <div style="font-size:0.78rem;color:var(--mid);margin-top:0.2rem">${type} · ${price} · ${l.location} · Available ${avail}</div>
        </div>
        <span style="font-size:0.75rem;padding:0.2rem 0.6rem;border-radius:6px;background:var(--green-light,#e6f4ec);color:var(--green);font-weight:600">Active</span>
      </div>
      ${l.description ? `<div style="font-size:0.82rem;color:var(--mid);margin-top:0.6rem;line-height:1.5">${l.description}</div>` : ''}
    </div>`
  }).join('')
}

// Newsletter listing copy overrides — stored in memory only, not saved to DB
let nlOverrides = {}

function nlEditListing(id) {
  const row = document.getElementById('nl-row-' + id)
  const editor = document.getElementById('nl-edit-' + id)
  if (!editor) return
  editor.style.display = editor.style.display === 'none' ? '' : 'none'
}

function nlSaveOverride(id) {
  const title = document.getElementById('nl-ov-title-' + id)?.value?.trim()
  const desc = document.getElementById('nl-ov-desc-' + id)?.value?.trim()
  const price = document.getElementById('nl-ov-price-' + id)?.value?.trim()
  nlOverrides[id] = { title, desc, price }
  document.getElementById('nl-edit-' + id).style.display = 'none'
  // Update the display row
  if (title) document.querySelector(`#nl-row-${id} .nl-ov-title`).textContent = title
  if (price) document.querySelector(`#nl-row-${id} .nl-ov-price`).textContent = price
  toast('✓ Copy updated for newsletter', 'green')
}

async function loadNLListings() {
  const queue = document.getElementById('nl-listings-queue')
  if (!queue) return
  const data = await api('/api/listings')
  if (!data.listings || data.listings.length === 0) {
    queue.innerHTML = '<div style="color:var(--light);font-size:0.85rem;padding:0.5rem 0">No active listings this week.</div>'
    return
  }
  const typeIcon = { flatshare: '🏠', rental: '🏢', sublet: '🌿' }
  queue.innerHTML = data.listings.map(l => {
    const price = l.price ? `£${Math.round(l.price / 100)}/mo` : 'Free'
    const icon = typeIcon[l.type] || '🏠'
    const type = l.type ? l.type.charAt(0).toUpperCase() + l.type.slice(1) : ''
    const ov = nlOverrides[l.id] || {}
    return `<div class="nl-queue-row" id="nl-row-${l.id}" style="flex-direction:column;align-items:stretch;gap:0.6rem">
      <div style="display:flex;align-items:center;gap:0.7rem">
        <span style="font-size:1.2rem">${icon}</span>
        <div style="flex:1">
          <div style="font-weight:600;font-size:0.86rem" class="nl-ov-title">${ov.title || l.title}</div>
          <div style="font-size:0.73rem;color:var(--light)">${type} · <span class="nl-ov-price">${ov.price || price}</span> · ${l.location}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="nlEditListing('${l.id}')">✏️ Edit copy</button>
      </div>
      <div id="nl-edit-${l.id}" style="display:none;background:var(--cream);border-radius:10px;padding:0.8rem;display:none">
        <div class="field" style="margin-bottom:0.5rem"><label style="font-size:0.78rem">Title for newsletter</label><input type="text" id="nl-ov-title-${l.id}" value="${ov.title || l.title}" style="font-size:0.84rem"></div>
        <div class="field" style="margin-bottom:0.5rem"><label style="font-size:0.78rem">Price display</label><input type="text" id="nl-ov-price-${l.id}" value="${ov.price || price}" style="font-size:0.84rem"></div>
        <div class="field" style="margin-bottom:0.6rem"><label style="font-size:0.78rem">Description for newsletter</label><textarea id="nl-ov-desc-${l.id}" style="min-height:70px;font-size:0.84rem">${ov.desc || l.description || ''}</textarea></div>
        <button class="btn btn-primary btn-sm" onclick="nlSaveOverride('${l.id}')">Save</button>
        <button class="btn btn-ghost btn-sm" onclick="nlEditListing('${l.id}')" style="margin-left:0.4rem">Cancel</button>
      </div>
    </div>`
  }).join('')
}

function confirmSendNL(btn) {
  if (btn.dataset.confirm === 'true') {
    btn.dataset.confirm = ''
    btn.textContent = '📨 Send newsletter now'
    btn.style.background = ''
    scheduleNL()
  } else {
    btn.dataset.confirm = 'true'
    btn.textContent = '⚠️ Are you sure? Click again to send'
    btn.style.background = '#e07b00'
    setTimeout(() => {
      if (btn.dataset.confirm === 'true') {
        btn.dataset.confirm = ''
        btn.textContent = '📨 Send newsletter now'
        btn.style.background = ''
      }
    }, 5000)
  }
}

async function scheduleNL() {
  const subject = document.getElementById('nl-subject')?.value?.trim()
  const intro = document.getElementById('nl-intro')?.value?.trim()
  if (!subject || !intro) { toast('Please add a subject and intro message'); return }

  const btn = event?.target
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…' }

  const data = await api('/api/newsletter/send', {
    method: 'POST',
    body: JSON.stringify({ subject, intro, overrides: nlOverrides }),
  })

  if (btn) { btn.disabled = false; btn.textContent = '📅 Schedule for Thursday →' }

  if (data.error) { toast(data.error); return }
  toast(`✓ Newsletter sent to ${data.sent} subscribers`, 'green')
}

// ══ SUBSCRIBERS ══

async function loadSubscribers() {
  const data = await api('/api/subscribers')
  if (data.error || !data.subscribers) return
  renderSubTable(data.subscribers)
}

function renderSubTable(subscribers) {
  const tbody = document.getElementById('sub-table-body')
  if (!tbody || !subscribers) return

  const active = subscribers.filter(s => s.active)
  const cnt = document.getElementById('nl-sub-count')
  if (cnt) cnt.textContent = active.length.toLocaleString()

  const tots = document.querySelector('[data-stat="total-subs"]')
  if (tots) tots.textContent = subscribers.length.toLocaleString()

  tbody.innerHTML = subscribers.map(s => `
    <tr>
      <td style="padding-left:1.4rem">
        <div style="display:flex;align-items:center;gap:0.6rem">
          <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--gold));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:0.7rem;flex-shrink:0">${(s.name?.[0] || s.email[0]).toUpperCase()}</div>
          <span style="font-weight:600;font-size:0.86rem">${s.name || '—'}</span>
        </div>
      </td>
      <td style="font-size:0.84rem;color:var(--mid)">${s.email}</td>
      <td style="font-size:0.81rem;color:var(--light)">${s.subscribed_at ? new Date(s.subscribed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
      <td><span class="badge badge-type">${s.source || 'website'}</span></td>
      <td><span class="badge ${s.active ? 'badge-live' : 'badge-expired'}">${s.active ? 'Active' : 'Unsubscribed'}</span></td>
      <td><button class="btn btn-ghost btn-sm">${s.active ? 'Unsub' : 'Re-sub'}</button></td>
    </tr>`).join('')
}

function showAddSub() {
  const el = document.getElementById('add-sub-form')
  if (el) el.style.display = ''
}

async function addSubscriber() {
  const name = document.getElementById('new-sub-name')?.value.trim()
  const email = document.getElementById('new-sub-email')?.value.trim()
  if (!email) { toast('Please enter an email address'); return }

  const data = await api('/api/subscribers', {
    method: 'POST',
    body: JSON.stringify({ email, name }),
  })

  if (data.error) { toast(data.error); return }

  const form = document.getElementById('add-sub-form')
  if (form) form.style.display = 'none'
  if (document.getElementById('new-sub-name')) document.getElementById('new-sub-name').value = ''
  if (document.getElementById('new-sub-email')) document.getElementById('new-sub-email').value = ''
  toast('✓ Subscriber added', 'green')
  loadSubscribers()
}

// ══ PROMO CODES ══

async function loadPromos() {
  const data = await api('/api/promos')
  if (data.error || !data.promos) return
  renderPromoTable(data.promos)
}

function renderPromoTable(promos) {
  const tbody = document.getElementById('promo-table-body')
  if (!tbody || !promos) return

  const cnt = document.getElementById('promo-active-count')
  if (cnt) cnt.textContent = promos.filter(p => p.active).length + ' active'

  tbody.innerHTML = promos.map(p => `
    <tr>
      <td style="padding-left:1.4rem">
        <span style="font-family:monospace;font-weight:700;font-size:0.92rem;letter-spacing:1px;color:var(--accent)">${p.code}</span>
      </td>
      <td style="font-size:0.83rem">${p.description || p.discount_type}</td>
      <td style="font-size:0.83rem">${p.uses_count || 0}${p.max_uses ? ` / ${p.max_uses}` : ' / ∞'}</td>
      <td style="font-size:0.81rem;color:var(--light)">${p.expiry || 'Never'}</td>
      <td style="font-size:0.81rem;color:var(--mid)">${p.note || '—'}</td>
      <td><span class="badge ${p.active ? 'badge-live' : 'badge-expired'}">${p.active ? 'Active' : 'Disabled'}</span></td>
      <td style="display:flex;gap:0.4rem">
        <button class="btn btn-ghost btn-sm" onclick="togglePromo('${p.code}',${p.active})">${p.active ? 'Disable' : 'Enable'}</button>
        <button class="btn btn-ghost btn-sm" onclick="deletePromo('${p.code}')" style="color:#C0392B;border-color:#FADBD8">Delete</button>
      </td>
    </tr>`).join('')
}

async function createPromo() {
  const code = document.getElementById('new-promo-code')?.value.trim().toUpperCase()
  const type = document.getElementById('new-promo-type')?.value
  const uses = document.getElementById('new-promo-uses')?.value
  const exp = document.getElementById('new-promo-expires')?.value
  const note = document.getElementById('new-promo-note')?.value.trim()

  if (!code) { toast('Please enter a promo code'); return }

  const data = await api('/api/promos', {
    method: 'POST',
    body: JSON.stringify({ code, discount_type: type, max_uses: uses ? parseInt(uses) : null, expiry: exp || null, note }),
  })

  if (data.error) { toast(data.error); return }
  ;['new-promo-code', 'new-promo-uses', 'new-promo-expires', 'new-promo-note'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = ''
  })
  toast(`✓ Promo code ${code} created`, 'green')
  loadPromos()
}

async function togglePromo(code, currentlyActive) {
  await api('/api/promos', {
    method: 'PATCH',
    body: JSON.stringify({ code, active: !currentlyActive }),
  })
  toast(currentlyActive ? `${code} disabled` : `✓ ${code} enabled`, currentlyActive ? '' : 'green')
  loadPromos()
}

async function deletePromo(code) {
  if (!confirm(`Delete promo code ${code}? This cannot be undone.`)) return
  await api('/api/promos', { method: 'DELETE', body: JSON.stringify({ code }) })
  toast(`${code} deleted`)
  loadPromos()
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
  const el = document.getElementById('new-promo-code')
  if (el) el.value = code
}

// ── AUTH TABS ──
function switchTab(tab) {
  ;['in', 'up', 'forgot'].forEach(x => {
    const el = document.getElementById('form-' + x)
    if (el) el.style.display = x === tab ? '' : 'none'
  })
  ;['in', 'up'].forEach(x => {
    const el = document.getElementById('tab-' + x)
    if (el) el.classList.toggle('active', x === tab)
  })
}

// ── CHECK URL PARAMS (return from Stripe) ──
function checkSuccessParam() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('success') === 'listing') {
    showScreen('dash')
    showPanel('mylistings')
    toast('✓ Payment confirmed — listing scheduled for Thursday!', 'green')
    loadMyListings()
    window.history.replaceState({}, '', '/')
  } else if (params.get('success') === 'subscription') {
    toast('✓ Subscription active — you can now message landlords!', 'green')
    window.history.replaceState({}, '', '/')
  } else if (params.get('cancelled') === 'true') {
    toast('Payment cancelled. Your listing draft is saved.')
    window.history.replaceState({}, '', '/')
  }
}

// ── COOKIES ──
function acceptCookies() {
  localStorage.setItem('hf_cookies', 'accepted')
  const el = document.getElementById('cookie-banner')
  if (el) el.style.display = 'none'
}
function declineCookies() {
  localStorage.setItem('hf_cookies', 'declined')
  const el = document.getElementById('cookie-banner')
  if (el) el.style.display = 'none'
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  // Show cookie banner if not yet accepted
  if (!localStorage.getItem('hf_cookies')) {
    const el = document.getElementById('cookie-banner')
    if (el) el.style.display = 'flex'
  }
  // Handle Google OAuth redirect (token arrives in URL hash)
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const oauthToken = hash.get('access_token')
  if (oauthToken) {
    const oauthRefresh = hash.get('refresh_token')
    const oauthExpiresRaw = hash.get('expires_at')
    const oauthExpires = oauthExpiresRaw ? parseInt(oauthExpiresRaw, 10) : null
    window.history.replaceState({}, '', window.location.pathname)
    authToken = oauthToken
    api('/api/auth/me').then(data => {
      if (data.user) {
        setSession(data.user, oauthToken, oauthRefresh, oauthExpires)
        launchDash(data.user.first_name || data.user.email?.split('@')[0] || 'You', data.user.last_name || '')
      } else {
        toast('Google sign-in failed. Please try again.')
        showScreen('landing')
      }
    })
    return
  }

  // Restore session if exists
  const savedToken = localStorage.getItem('hf_token')
  const savedUser = localStorage.getItem('hf_user')
  const savedRefresh = localStorage.getItem('hf_refresh')
  const savedExpires = localStorage.getItem('hf_expires')
  if (savedToken && savedUser) {
    try {
      const user = JSON.parse(savedUser)
      setSession(user, savedToken, savedRefresh, savedExpires ? parseInt(savedExpires, 10) : null)
      launchDash(user.first_name || user.email?.split('@')[0] || 'You', user.last_name || '')
    } catch {}
  }

  // Newsletter char count
  const ta = document.getElementById('nl-intro')
  if (ta) {
    ta.addEventListener('input', () => {
      const cnt = document.getElementById('nl-char-count')
      if (cnt) cnt.textContent = ta.value.length + ' characters'
    })
  }

  // Load landing preview
  loadLandingPreview()

  // Check Stripe return params
  checkSuccessParam()

  // Direct deep-link: ?goto=post or ?goto=browse
  const goto = new URLSearchParams(window.location.search).get('goto')
  if (goto === 'post') goToPost()
  else if (goto === 'browse') goToBrowse()

  // Close dropdowns on outside click
  document.addEventListener('click', e => {
    document.querySelectorAll('.star-dropdown.open, .star-sign-dropdown.open').forEach(d => {
      if (!d.closest('.star-select-wrap, .star-sign-wrap')?.contains(e.target)) {
        d.classList.remove('open')
      }
    })
  })
})
