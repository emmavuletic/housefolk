/* ══════════════════════════════════════════════
   HOMEFOLK — Real API Client
   Replaces all mock functions with live backend calls
   ══════════════════════════════════════════════ */

// ── AUTH STATE ──
let currentUser = null
let authToken = null
let currentListingId = null

const _supabase = supabase.createClient(
  'https://agfgtajovhhxswfdcqen.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnZmd0YWpvdmhoeHN3ZmRjcWVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MDc3NjIsImV4cCI6MjA4ODI4Mzc2Mn0.ewkfK672jnQXAhq_Fh4CoGBOUmBNXxhZU4B_d4QnsvQ'
)

function getToken() {
  return authToken
}
function setSession(user, token) {
  currentUser = user
  authToken = token
  localStorage.setItem('hf_user', JSON.stringify(user))
}
function clearSession() {
  currentUser = null
  authToken = null
  localStorage.removeItem('hf_user')
  // Clean up keys from old auth implementation
  localStorage.removeItem('hf_token')
  localStorage.removeItem('hf_refresh')
  localStorage.removeItem('hf_expires')
}

// ── API HELPER ──
async function api(path, opts = {}) {
  const { data: { session } } = await _supabase.auth.getSession()
  const token = session?.access_token || authToken
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

let _tsSignInToken = null
let _tsSignUpToken = null
function onTurnstileSignIn(token) { _tsSignInToken = token }
function onTurnstileSignUp(token) { _tsSignUpToken = token }
function onTurnstileSignInExpired() { _tsSignInToken = null }
function onTurnstileSignUpExpired() { _tsSignUpToken = null }

async function getSignInToken() {
  if (_tsSignInToken) return _tsSignInToken
  if (window.turnstile) turnstile.execute('#ts-signin')
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 100))
    if (_tsSignInToken) return _tsSignInToken
  }
  return null
}
async function getSignUpToken() {
  if (_tsSignUpToken) return _tsSignUpToken
  if (window.turnstile) turnstile.execute('#ts-signup')
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 100))
    if (_tsSignUpToken) return _tsSignUpToken
  }
  return null
}

async function doSignIn() {
  const email = document.getElementById('si-email').value.trim()
  const password = document.getElementById('si-pass').value
  if (!email || !password) { toast('Please enter your email and password'); return }

  const btn = event.target
  btn.textContent = 'Signing in…'
  btn.disabled = true

  const captchaToken = await getSignInToken()
  const { data, error } = await _supabase.auth.signInWithPassword({
    email, password,
    options: { captchaToken: captchaToken || undefined },
  })
  _tsSignInToken = null

  btn.disabled = false
  btn.textContent = 'Sign in →'

  if (error) {
    if (window.turnstile) turnstile.reset('#ts-signin')
    toast(error.message); return
  }

  const profile = await api('/api/users/me')
  const user = profile.user || { email, first_name: email.split('@')[0], last_name: '' }
  setSession(user, data.session.access_token)
  launchDash(user.first_name || email.split('@')[0], user.last_name || '')
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

  const captchaToken = await getSignUpToken()
  const { error } = await _supabase.auth.signUp({
    email, password,
    options: {
      captchaToken: captchaToken || undefined,
      data: {
        first_name: first, last_name: last,
        role: role === 'list' ? 'landlord' : 'tenant',
        subscribe_newsletter: subscribe,
      },
    },
  })
  _tsSignUpToken = null

  btn.disabled = false
  btn.textContent = 'Create my account →'

  if (error) {
    if (window.turnstile) turnstile.reset('#ts-signup')
    toast(error.message); return
  }
  toast('✓ Account created — you can sign in now', 'green')
  setTimeout(() => switchTab('in'), 2000)
}

async function doSetNewPassword() {
  const pass = document.getElementById('setnew-pass').value
  const confirm = document.getElementById('setnew-confirm').value
  if (!pass || pass.length < 8) { toast('Password must be at least 8 characters'); return }
  if (pass !== confirm) { toast('Passwords do not match'); return }
  const { error } = await _supabase.auth.updateUser({ password: pass })
  if (error) {
    const msg = error.message || ''
    toast(msg.toLowerCase().includes('same') || msg.toLowerCase().includes('different') ? 'Please choose a different password — you cannot reuse your current one.' : (msg || 'Failed to update password'))
  } else {
    toast('✓ Password updated — please sign in', 'green')
    setTimeout(() => switchTab('in'), 2000)
  }
}

async function doMagicLink() {
  const email = document.getElementById('magic-email').value.trim()
  if (!email) { toast('Please enter your email address'); return }
  const captchaToken = await getSignInToken()
  _tsSignInToken = null
  const { error } = await _supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: 'https://app.housefolk.co/housefolk.html',
      captchaToken: captchaToken || undefined,
    }
  })
  if (window.turnstile) turnstile.reset('#ts-signin')
  if (error) { toast(error.message); return }
  toast('✓ Check your email for a sign-in link!', 'green')
}

// ── PROFILE ──
async function loadProfile() {
  const data = await api('/api/users/me')
  if (data.error || !data.user) return
  const u = data.user
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || '' }
  set('p-first', u.first_name)
  set('p-last', u.last_name)
  set('p-bio', u.bio)
  set('p-instagram', u.instagram)
  set('p-linkedin', u.linkedin)
  set('p-job-title', u.job_title)
  set('p-company', u.company)
  set('p-interests', u.interests)
  set('p-pet-peeves', u.pet_peeves)
  set('p-hopes-dreams', u.hopes_dreams)
  set('p-hard-nos', u.hard_nos)
  set('p-daily-schedule', u.daily_schedule)
  // Avatar
  const preview = document.getElementById('p-avatar-preview')
  if (preview) {
    if (u.avatar_url) {
      preview.innerHTML = `<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover">`
    } else {
      const initials = ((u.first_name?.[0] || '') + (u.last_name?.[0] || '')).toUpperCase() || '?'
      preview.textContent = initials
    }
  }
  // Star sign
  buildSeekerSignGrid(u.star_sign || null)
  if (u.star_sign) {
    const sign = STAR_SIGNS.find(s => s.v === u.star_sign)
    const label = document.getElementById('seeker-sign-label')
    if (label && sign) label.textContent = `${sign.e} ${sign.l}`
  }
}

function previewAvatar(input) {
  const file = input.files?.[0]
  if (!file) return
  const preview = document.getElementById('p-avatar-preview')
  if (!preview) return
  const url = URL.createObjectURL(file)
  preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover">`
}

async function saveProfile() {
  const btn = document.querySelector('#panel-profile .btn-primary')
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…' }
  const resetBtn = () => { if (btn) { btn.disabled = false; btn.textContent = 'Save profile' } }

  // Refresh session token
  const { data: { session } } = await _supabase.auth.getSession()
  if (session?.access_token) setSession(currentUser, session.access_token)
  const token = getToken()
  if (!token) { toast('Please sign in first'); resetBtn(); return }

  const get = id => document.getElementById(id)?.value?.trim() || null
  const starSign = document.querySelector('input[name="seeker-sign-radio"]:checked')?.value || null

  // Upload avatar if a new file was selected
  const avatarFile = document.getElementById('p-avatar-file')?.files?.[0]
  if (avatarFile) {
    if (avatarFile.size > 2 * 1024 * 1024) {
      toast('Photo must be under 2MB'); resetBtn(); return
    }
    const fd = new FormData()
    fd.append('file', avatarFile)
    const res = await fetch('/api/users/me/avatar', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
    const avatarData = await res.json()
    if (avatarData.error) { toast(avatarData.error); resetBtn(); return }
  }

  const data = await api('/api/users/me', {
    method: 'PATCH',
    body: JSON.stringify({
      first_name: get('p-first'),
      last_name: get('p-last'),
      bio: get('p-bio'),
      instagram: get('p-instagram'),
      linkedin: get('p-linkedin'),
      job_title: get('p-job-title'),
      company: get('p-company'),
      star_sign: starSign,
      interests: get('p-interests'),
      pet_peeves: get('p-pet-peeves'),
      hopes_dreams: get('p-hopes-dreams'),
      hard_nos: get('p-hard-nos'),
      daily_schedule: get('p-daily-schedule'),
    }),
  })
  if (data.error) { toast(data.error); resetBtn(); return }
  if (data.user) {
    const first = data.user.first_name || ''
    const last = data.user.last_name || ''
    const nameEl = document.getElementById('u-name')
    if (nameEl) nameEl.textContent = first + (last ? ' ' + last[0] + '.' : '')
    const initEl = document.getElementById('u-initials')
    if (initEl) initEl.textContent = ((first[0] || '') + (last[0] || first[1] || '')).toUpperCase()
  }
  resetBtn()
  toast('✓ Profile saved', 'green')
}

function signOut() {
  _supabase.auth.signOut()
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

function goToRoommates() {
  const token = getToken()
  if (!token) {
    showScreen('auth')
  } else {
    showScreen('dash')
    showPanel('roommates')
  }
}

let _pendingTier = null

function selectTierFromModal(tier) {
  document.getElementById('prepost-modal').style.display = 'none'
  const token = getToken()
  if (token) {
    showScreen('dash')
    showPanel('post')
    selectTier(tier)
  } else {
    _pendingTier = tier
    showScreen('auth')
    switchTab('up')
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
    document.querySelectorAll('.non-admin').forEach(el => el.style.display = 'none')
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

  // If user came from post.html, show the post panel with tier cards
  if (_pendingTier) {
    _pendingTier = null
    showPanel('post')
  } else {
    showPanel('overview')
  }

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
  roommates: 'si-roommates', saved: 'si-saved',
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
    startInboxPolling()
  } else {
    stopInboxPolling()
  }
  if (name === 'mylistings') loadMyListings()
  if (name === 'post') resetPost()
  if (name === 'newsletter') loadNLListings()
  if (name === 'weeklistings') loadWeekListings()
  if (name === 'profile') { buildSeekerSignGrid(null); loadProfile() }
  if (name === 'tenant') loadSavedListings()
  if (name === 'saved') loadSavedListings()
  if (name === 'roommates') loadRoommates()
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
  flatshare: { name: 'Flatshare', icon: '🏠', price: 1500, label: '£15/week', maxPhotos: 20 },
  rental:    { name: 'Apartment Rental', icon: '🏢', price: 1500, label: '£15/week', maxPhotos: 20 },
  sublet:    { name: 'Apartment Sublet', icon: '🌿', price: 2000, label: '£20/week', maxPhotos: 10 },
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

  const fextras = document.getElementById('f-extras')
  if (fextras) fextras.style.display = tier === 'flatshare' ? '' : 'none'

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
      if (fpmsg) fpmsg.textContent = 'Promo code applied. Your listing is now live.'
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

  const ptitle = document.getElementById('pay-title-h')
  if (ptitle) ptitle.textContent = isFree ? '✅ Review & publish' : '💳 Review & pay'

  const fp = document.getElementById('free-path')
  const pp = document.getElementById('paid-path')
  if (fp) fp.style.display = isFree ? '' : 'none'
  if (pp) pp.style.display = isFree ? 'none' : ''

  const ps = document.getElementById('promo-section')
  if (ps) ps.style.display = 'none'

  const pba = document.getElementById('pay-btn-amt')
  if (!isFree && pba) pba.textContent = P.label

  const summary = document.getElementById('pay-summary')
  if (summary) {
    summary.innerHTML = `
      <div class="pay-row"><span class="pl">Listing type</span><span class="pv">${P.icon} ${P.name}</span></div>
      <div class="pay-row"><span class="pl">Title</span><span class="pv" style="max-width:230px;text-align:right;font-size:0.82rem">${escapeHtml(title)}</span></div>
      <div class="pay-row"><span class="pl">Location</span><span class="pv">${escapeHtml(loc)}</span></div>
      ${price ? `<div class="pay-row"><span class="pl">Monthly rent</span><span class="pv">£${price}/mo</span></div>` : ''}
      ${beds ? `<div class="pay-row"><span class="pl">Bedrooms</span><span class="pv">${beds}</span></div>` : ''}
      ${baths ? `<div class="pay-row"><span class="pl">Bathrooms</span><span class="pv">${baths}</span></div>` : ''}
      ${avail ? `<div class="pay-row"><span class="pl">Available from</span><span class="pv">${new Date(avail).toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric'})}</span></div>` : ''}
      ${bills ? `<div class="pay-row"><span class="pl">Bills</span><span class="pv">${bills}</span></div>` : ''}
      ${furn ? `<div class="pay-row"><span class="pl">Furnishing</span><span class="pv">${furn}</span></div>` : ''}
      ${desc ? `<div class="pay-row" style="align-items:flex-start"><span class="pl">Description</span><span class="pv" style="max-width:230px;text-align:right;font-size:0.82rem">${escapeHtml(desc)}</span></div>` : ''}
      <div class="pay-row"><span class="pl">Photos</span><span class="pv">${photos.length} uploaded</span></div>
      <div class="pay-row"><span class="pl">Duration</span><span class="pv">Weekly subscription, cancel anytime</span></div>
      <div class="pay-row"><span class="pl">Goes live</span><span class="pv">Immediately on payment</span></div>
      <div class="pay-row"><span class="pl">Newsletter</span><span class="pv">✓ Thursday edition</span></div>
      ${isFree ? `<div class="pay-row"><span class="pl">Promo code</span><span class="pv" style="color:var(--green)">${promoApplied} ✓</span></div>` : ''}
      <div class="pay-row total"><span class="pl">Total today</span><span class="pv ${isFree ? 'free' : ''}">${isFree ? 'Free' : P.label}${isFree ? `<span class="strike">${P.label}</span>` : ''}</span></div>`
  }
}

// ── PUBLISH LISTING ──
async function publishListing(btnEl) {
  const { data: { session } } = await _supabase.auth.getSession()
  if (session?.access_token) setSession(currentUser, session.access_token)
  const token = getToken()
  if (!token) { toast('Please sign in first'); return }

  const btn = btnEl || event?.target
  if (btn) { btn.disabled = true; btn.textContent = 'Processing…' }
  const resetBtn = () => { if (btn) { btn.disabled = false; btn.textContent = 'Confirm & publish →' } }

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
      photos: uploadedPhotoUrls,
      ...(currentTier === 'flatshare' ? {
        spotify_url: document.getElementById('f-spotify')?.value?.trim(),
        instagram: document.getElementById('f-instagram')?.value?.trim(),
        linkedin: document.getElementById('f-linkedin')?.value?.trim(),
        star_signs: getSelectedStarSigns(),
        music_vibes: getSelectedMusicVibes(),
      } : {}),
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

    if (promoApplied) {
      const checkoutResult = await api('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({ listing_id: currentListingId, type: currentTier, promo_code: promoApplied }),
      })
      if (checkoutResult.free) { showSuccessScreen(true); loadMyListings(); return }
      toast(checkoutResult.error || 'Promo failed'); resetBtn(); return
    }

    // Paid path — redirect to Stripe
    if (btn) btn.textContent = 'Redirecting to payment…'
    const checkoutResult = await api('/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ listing_id: currentListingId, type: currentTier }),
    })
    if (checkoutResult.url) { window.location.href = checkoutResult.url; return }
    toast(checkoutResult.error || 'Checkout failed'); resetBtn()
  } catch (err) {
    resetBtn()
    toast('Something went wrong: ' + (err.message || err))
  }
}

function showSuccessScreen(isFree) {
  const P = PLANS[currentTier]
  const expStr = futureDate(7)

  document.getElementById('s-icon').textContent = '✅'
  document.getElementById('s-title').textContent = 'Your listing is live!'
  document.getElementById('s-msg').textContent = `Your listing is now live and visible to renters.`
  document.getElementById('s-details').innerHTML = `
    <div class="sd-row"><span>Type</span><strong>${P.icon} ${P.name}</strong></div>
    <div class="sd-row"><span>Status</span><strong>Live now</strong></div>
    <div class="sd-row"><span>Expires</span><strong>${expStr}</strong></div>
    ${isFree ? `<div class="sd-row"><span>Payment</span><strong>Promo code applied — free ✓</strong></div>` : `<div class="sd-row"><span>Payment</span><strong>${P.label} via Stripe ✓</strong></div>`}`
  goStep('e')
}

function resetPost() {
  currentTier = null; photos = []; uploadedPhotoUrls = []; promoApplied = false
  buildSeekerSignGrid(null, 'post-seeker-sign-grid', 'post-seeker-sign-radio', 'post-seeker-sign-label')
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

// ── SEEKER STAR SIGN (profile — single select) ──
const STAR_SIGNS = [
  { v: 'aries', e: '♈', l: 'Aries' }, { v: 'taurus', e: '♉', l: 'Taurus' },
  { v: 'gemini', e: '♊', l: 'Gemini' }, { v: 'cancer', e: '♋', l: 'Cancer' },
  { v: 'leo', e: '♌', l: 'Leo' }, { v: 'virgo', e: '♍', l: 'Virgo' },
  { v: 'libra', e: '♎', l: 'Libra' }, { v: 'scorpio', e: '♏', l: 'Scorpio' },
  { v: 'sagittarius', e: '♐', l: 'Sagittarius' }, { v: 'capricorn', e: '♑', l: 'Capricorn' },
  { v: 'aquarius', e: '♒', l: 'Aquarius' }, { v: 'pisces', e: '♓', l: 'Pisces' },
]
function buildSeekerSignGrid(selected, gridId, radioName, labelId) {
  const gId = gridId || 'seeker-sign-grid'
  const rName = radioName || 'seeker-sign-radio'
  const lId = labelId || 'seeker-sign-label'
  const grid = document.getElementById(gId)
  if (!grid) return
  grid.innerHTML = STAR_SIGNS.map(s => `
    <label style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.6rem;border-radius:9px;cursor:pointer;font-size:0.85rem;transition:background 0.15s;${selected===s.v?'background:var(--cream);font-weight:600':''}">
      <input type="radio" name="${rName}" value="${s.v}" ${selected===s.v?'checked':''} onchange="onSeekerSignChange(this,'${lId}')" style="accent-color:#f7b188;width:15px;height:15px;cursor:pointer">
      <span>${s.e} ${s.l}</span>
    </label>`).join('')
}
function onSeekerSignChange(radio, labelId) {
  const label = document.getElementById(labelId || 'seeker-sign-label')
  if (label) {
    const sign = STAR_SIGNS.find(s => s.v === radio.value)
    label.textContent = sign ? `${sign.e} ${sign.l}` : radio.value
  }
}
function toggleStarDrop(id, e) {
  if (e) e.stopPropagation()
  const drop = document.getElementById(id + '-drop')
  if (drop) drop.classList.toggle('open')
}
// Close star drop when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('.star-sign-wrap')) {
    document.querySelectorAll('.star-sign-dropdown.open').forEach(d => d.classList.remove('open'))
  }
})

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

  const container = document.getElementById('my-listings-list')
  if (!container) return

  const typeIcon = { flatshare: '🏠', rental: '🏢', sublet: '🌿' }

  function listingStatusBadge(l) {
    if (l.status === 'draft') return '<span class="badge badge-pending">Draft</span>'
    if (l.status === 'expired') return '<span class="badge badge-expired">Expired</span>'
    if (l.status === 'let') return '<span class="badge badge-pending">Let</span>'
    if (l.status === 'active') {
      const expiry = l.access_expires_at
        ? new Date(l.access_expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        : null
      if (l.cancel_at_period_end || l.subscription_status === 'canceled') {
        return `<span class="badge badge-live">● Live</span><span style="font-size:0.72rem;color:var(--mid)">Cancelling — live until ${expiry || '—'}</span>`
      }
      if (l.subscription_status === 'past_due') {
        return `<span class="badge badge-expired">Payment overdue</span>`
      }
      return `<span class="badge badge-live">● Live</span>${expiry ? `<span style="font-size:0.72rem;color:var(--mid)">Renews ${expiry}</span>` : ''}`
    }
    return `<span class="badge badge-pending">${l.status}</span>`
  }

  if (data.listings.length === 0) {
    container.innerHTML = '<div class="fcard" style="text-align:center;padding:2rem;color:var(--light)">No listings yet — <a onclick="showPanel(\'post\')" style="color:var(--accent);cursor:pointer">post your first listing →</a></div>'
    return
  }

  container.innerHTML = data.listings.map(l => `
    <div class="fcard" style="margin-bottom:0.8rem;padding:1.2rem">
      <div style="display:flex;align-items:flex-start;gap:0.8rem;margin-bottom:0.9rem">
        <span style="font-size:1.6rem;flex-shrink:0">${typeIcon[l.type] || '🏠'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:0.93rem;margin-bottom:0.15rem">${escapeHtml(l.title)}</div>
          <div style="font-size:0.75rem;color:var(--light);margin-bottom:0.4rem">📍 ${escapeHtml(l.location)}</div>
          <div style="display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center">
            ${listingStatusBadge(l)}
            <span class="badge badge-type">${typeIcon[l.type]} ${l.type}</span>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="openListing('${l.id}')">Preview</button>
        ${l.status !== 'expired' ? `<button class="btn btn-ghost btn-sm" onclick="editListing('${l.id}')">Edit</button>` : ''}
        ${l.status !== 'expired' ? `<button class="btn btn-ghost btn-sm" onclick="markAsLet('${l.id}')">Mark let</button>` : ''}
        ${currentUser?.role === 'admin' && l.status === 'draft' ? `<button class="btn btn-ghost btn-sm" onclick="adminActivateListing('${l.id}')" style="color:#2E7D52;border-color:#2E7D52">Activate</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="deleteListing('${l.id}')" style="color:#C0392B;border-color:#FADBD8">Delete</button>
      </div>
    </div>`).join('')
}

async function markAsLet(id) {
  const token = getToken()
  if (!token) return
  await api(`/api/listings/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'let' }) })
  toast('✓ Listing marked as let', 'green')
  loadMyListings()
}

async function adminActivateListing(id) {
  if (currentUser?.role !== 'admin') return
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)
  const result = await api(`/api/listings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'active', goes_live_at: new Date().toISOString(), expires_at: expiresAt.toISOString() }),
  })
  if (result.error) { toast(result.error); return }
  toast('✓ Listing activated', 'green')
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
let _editingListingType = null

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
  _editingListingType = l.type || null

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

  const elExtras = document.getElementById('el-extras')
  if (elExtras) elExtras.style.display = l.type === 'flatshare' ? '' : 'none'
  if (l.type === 'flatshare') {
    document.getElementById('el-spotify').value = l.spotify_url || ''
    document.querySelectorAll('#el-stars input[type=checkbox]').forEach(cb => {
      cb.checked = (l.star_signs || []).includes(cb.value)
    })
    updateElStarLabel()
    document.querySelectorAll('#el-music input[type=checkbox]').forEach(cb => {
      cb.checked = (l.music_vibes || []).includes(cb.value)
    })
    updateElMusicLabel()
  }

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
    ...(_editingListingType === 'flatshare' ? {
      spotify_url: document.getElementById('el-spotify').value.trim() || null,
      star_signs: Array.from(document.querySelectorAll('#el-stars input:checked')).map(c => c.value),
      music_vibes: Array.from(document.querySelectorAll('#el-music input:checked')).map(c => c.value),
    } : {}),
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
let _inboxPollTimer = null

function startInboxPolling() {
  stopInboxPolling()
  _inboxPollTimer = setInterval(async () => {
    const panel = document.getElementById('panel-inbox')
    if (!panel?.classList.contains('active')) { stopInboxPolling(); return }
    await loadEnquiries()
    // If a thread is open, also refresh the messages in it
    if (_activeEnquiryId) await refreshOpenThread()
  }, 20000) // every 20 seconds
}
function stopInboxPolling() {
  if (_inboxPollTimer) { clearInterval(_inboxPollTimer); _inboxPollTimer = null }
}
async function refreshOpenThread() {
  if (!_activeEnquiryId) return
  const data = await api(`/api/enquiries/${_activeEnquiryId}/messages`)
  const enquiry = currentTabEnquiries().find(e => e.id === _activeEnquiryId)
  if (!enquiry) return
  const tenantId = enquiry.tenant_id || enquiry.tenant?.id
  const seedBubble = renderMessageBubble({ id: 'seed', body: enquiry.message, created_at: enquiry.created_at, sender_id: tenantId })
  const allMessages = data.messages || []
  const msgList = document.getElementById('chat-messages-list')
  if (!msgList) return
  const wasAtBottom = msgList.scrollHeight - msgList.scrollTop - msgList.clientHeight < 60
  msgList.innerHTML = seedBubble + allMessages.map(m => renderMessageBubble(m)).join('')
  if (wasAtBottom) msgList.scrollTop = msgList.scrollHeight
}

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

  // Badge: conversations where the latest message is from the other person and not yet read
  const hasUnread = (e) => {
    if (e.last_message) return !e.read && e.last_message.sender_id !== currentUser?.id
    return !e.read
  }
  const allConvs = [..._sentEnquiries, ..._receivedEnquiries]
  const unread = allConvs.filter(hasUnread).length
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

    // Show latest message as preview if there is one, otherwise show original enquiry message
    const lastMsg = e.last_message
    const preview = lastMsg?.body || e.message || ''
    const previewTime = lastMsg?.created_at || e.created_at
    const timeStr = formatTimeAgo(previewTime)

    // Unread if: enquiry is marked unread AND the last message was sent by the other person
    const lastSenderIsOther = lastMsg ? lastMsg.sender_id !== currentUser?.id : false
    const isUnread = !e.read && lastSenderIsOther
    const isActive = e.id === _activeEnquiryId

    const previewPrefix = lastMsg
      ? (lastMsg.sender_id === currentUser?.id ? 'You: ' : `${other.first_name || 'Them'}: `)
      : ''

    return `
      <div class="chat-conv-item ${isActive ? 'active' : ''} ${isUnread ? 'unread' : ''}" onclick="openChatThread('${e.id}')">
        <div class="i-avatar" style="background:linear-gradient(135deg,#4A90D9,#7B68EE);width:34px;height:34px;font-size:0.75rem;flex-shrink:0">${initials}</div>
        <div class="chat-conv-meta">
          <div class="chat-conv-name">${escapeHtml(name)}</div>
          <div class="chat-conv-listing">Re: ${escapeHtml(listing.title || 'Listing')}</div>
          <div class="chat-conv-preview">${escapeHtml(previewPrefix)}${escapeHtml(preview)}</div>
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
  const listingLink = listing.id ? `<a href="/listings/${listing.id}">${escapeHtml(listing.title || 'Listing')} →</a>` : escapeHtml(listing.title || 'Listing')
  document.getElementById('chat-thread-sub').innerHTML = listingLink

  // Profile strip — show sender's profile to landlord (or landlord's to tenant)
  const profileEl = document.getElementById('chat-thread-profile')
  if (profileEl) {
    const p = other
    const initials = ((p.first_name?.[0] || '') + (p.last_name?.[0] || '')).toUpperCase() || '?'
    const jobLine = [p.job_title, p.company ? `at ${p.company}` : ''].filter(Boolean).join(' ')
    const igUrl = safeUrl(p.instagram)
    const liUrl = safeUrl(p.linkedin)
    const socialsHtml = [
      igUrl ? `<a href="${igUrl}" target="_blank" rel="noopener" style="color:var(--accent);font-size:0.8rem;text-decoration:none">📸 Instagram</a>` : '',
      liUrl ? `<a href="${liUrl}" target="_blank" rel="noopener" style="color:var(--accent);font-size:0.8rem;text-decoration:none">🔗 LinkedIn</a>` : '',
    ].filter(Boolean).join('<span style="color:var(--border)"> · </span>')

    profileEl.style.display = ''
    const hasExtra = p.bio || p.star_sign || jobLine || socialsHtml
    profileEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:0.8rem;margin-bottom:${hasExtra ? '0.6rem' : '0'}">
        <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#f7b188,#c4856a);display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;color:#fff;flex-shrink:0;overflow:hidden">${
          p.avatar_url ? `<img src="${escapeHtml(p.avatar_url)}" style="width:38px;height:38px;border-radius:50%;object-fit:cover">` : initials
        }</div>
        <div>
          <div style="font-weight:600;font-size:0.9rem;color:var(--dark)">${escapeHtml(otherName)}</div>
          ${jobLine ? `<div style="font-size:0.78rem;color:var(--mid)">${escapeHtml(jobLine)}</div>` : ''}
        </div>
      </div>
      ${p.star_sign ? `<div style="font-size:0.78rem;color:var(--mid);margin-bottom:0.35rem">✨ ${escapeHtml(p.star_sign.charAt(0).toUpperCase() + p.star_sign.slice(1))}</div>` : ''}
      ${p.bio ? `<div style="font-size:0.82rem;color:var(--mid);line-height:1.55;margin-bottom:0.4rem">${escapeHtml(p.bio)}</div>` : ''}
      ${socialsHtml ? `<div style="display:flex;gap:0.8rem">${socialsHtml}</div>` : ''}
      ${!hasExtra ? `<div style="font-size:0.78rem;color:var(--light);font-style:italic">This person hasn't added profile details yet.</div>` : ''}
    `
  }

  // Show "Suggest time" button only for landlords in received tab
  const suggestBtn = document.getElementById('chat-suggest-btn')
  const suggestRow = document.getElementById('chat-suggest-row')
  const isLandlordThread = _activeMsgTab === 'received'
  if (suggestBtn) suggestBtn.style.display = ''
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
function safeUrl(url) {
  try { const u = new URL(url); return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : null } catch { return null }
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

function _getOtherUserId() {
  if (!_activeEnquiryId) return null
  const enquiry = currentTabEnquiries().find(e => e.id === _activeEnquiryId)
  if (!enquiry) return null
  const isLandlord = (currentUser?.role === 'landlord' || currentUser?.role === 'admin')
  const other = isLandlord ? (enquiry.tenant || {}) : (enquiry.landlord || {})
  return other.id || null
}

async function blockChatUser() {
  const otherId = _getOtherUserId()
  if (!otherId) return
  const enquiry = currentTabEnquiries().find(e => e.id === _activeEnquiryId)
  const other = (currentUser?.role === 'landlord' || currentUser?.role === 'admin') ? (enquiry?.tenant || {}) : (enquiry?.landlord || {})
  const name = `${other.first_name || ''} ${other.last_name || ''}`.trim() || 'this user'
  if (!confirm(`Block ${name}? They won't be able to message you and this conversation will be hidden.`)) return
  const data = await api(`/api/users/${otherId}/block`, { method: 'POST' })
  if (data.error) { toast(data.error); return }
  toast('User blocked.', 'green')
  closeChatThread()
  // Remove blocked enquiries from local state
  _sentEnquiries = _sentEnquiries.filter(e => e.id !== _activeEnquiryId)
  _receivedEnquiries = _receivedEnquiries.filter(e => e.id !== _activeEnquiryId)
  renderConvList()
}

function reportChatUser() {
  if (!_activeEnquiryId) return
  document.getElementById('report-reason').value = ''
  document.getElementById('report-detail').value = ''
  document.getElementById('report-modal').style.display = 'flex'
}

async function submitReport() {
  const reason = document.getElementById('report-reason').value
  if (!reason) { toast('Please select a reason'); return }
  const detail = document.getElementById('report-detail').value.trim()
  const otherId = _getOtherUserId()
  if (!otherId) return
  const data = await api(`/api/users/${otherId}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason, detail, enquiry_id: _activeEnquiryId }),
  })
  document.getElementById('report-modal').style.display = 'none'
  if (data.error) { toast(data.error); return }
  toast('Report submitted — thank you.', 'green')
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
    grid.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--light)">No listings available right now. Check back soon!</div>'
    return
  }

  data.listings.forEach(l => { _listingCache[l.id] = l })
  grid.innerHTML = data.listings.map(l => {
    const priceStr = l.price ? `£${Math.round(l.price / 100).toLocaleString()}<span>/mo</span>` : 'Free sublet'
    const photo = l.photos?.[0]
    return `
      <div class="listing-card" onclick="window.location.href='/listings/${l.id}'" style="cursor:pointer">
        <div class="lc-photo">
          ${photo ? `<img src="${photo}" alt="${escapeHtml(l.title)}">` : `<div class="lc-photo-placeholder">${typeIcon[l.type] || '🏠'}</div>`}
          <span class="lc-type-badge">${typeIcon[l.type]} ${l.type}</span>
        </div>
        <div class="lc-body">
          <div class="lc-price">${priceStr}</div>
          <div class="lc-title">${escapeHtml(l.title)}</div>
          <div class="lc-location">📍 ${escapeHtml(l.location)}</div>
          <div class="lc-meta">
            ${l.beds ? `<span class="lc-tag">🛏 ${l.beds} bed</span>` : ''}
            ${l.baths ? `<span class="lc-tag">🚿 ${l.baths} bath</span>` : ''}
            ${l.bills_included ? '<span class="lc-tag">Bills incl.</span>' : ''}
          </div>
          ${l.description ? `<div class="lc-desc">${escapeHtml(l.description)}</div>` : ''}
          <div class="lc-footer">
            <span class="lc-avail">${l.available_date ? 'From ' + new Date(l.available_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Available now'}</span>
            ${isLoggedIn
              ? `<button class="lc-contact-btn" data-listing-id="${l.id}" onclick="event.stopPropagation();openEnquiryModal(this.dataset.listingId)">Message →</button>`
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
  // Load saved state (non-blocking)
  loadSavedIds().then(() => {
    const btn = document.getElementById('detail-save-btn')
    if (btn) btn.textContent = _savedIds.has(l.id) ? '❤️' : '🤍'
  })
  const typeIcon = { flatshare: '🏠', rental: '🏢', sublet: '🌿' }

  // Photo
  const photoEl = document.getElementById('detail-photo')
  if (l.photos && l.photos.length > 0) {
    photoEl.style.backgroundImage = `url(${l.photos[0]})`
    photoEl.style.backgroundSize = 'cover'
    photoEl.style.backgroundPosition = 'center'
    photoEl.innerHTML = `
      <div style="position:absolute;top:1rem;right:1rem;display:flex;gap:0.5rem">
        <button id="detail-save-btn" onclick="toggleSaveListing('${l.id}', event)" style="background:rgba(255,255,255,0.9);border:none;border-radius:50%;width:38px;height:38px;cursor:pointer;font-size:1.1rem;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.15)">🤍</button>
        <button onclick="closeListing()" style="background:rgba(255,255,255,0.9);border:none;border-radius:50%;width:38px;height:38px;cursor:pointer;font-size:0.9rem;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.15)">✕</button>
      </div>
      <div style="position:absolute;top:1rem;left:1rem" id="detail-type-badge"></div>`
  } else {
    photoEl.style.backgroundImage = ''
    photoEl.innerHTML = `
      <span style="font-size:5rem">${typeIcon[l.type] || '🏠'}</span>
      <div style="position:absolute;top:1rem;right:1rem;display:flex;gap:0.5rem">
        <button id="detail-save-btn" onclick="toggleSaveListing('${l.id}', event)" style="background:rgba(255,255,255,0.9);border:none;border-radius:50%;width:38px;height:38px;cursor:pointer;font-size:1.1rem;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.15)">🤍</button>
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

  // Star signs (flatshare only)
  const starsEl = document.getElementById('detail-stars')
  if (starsEl) {
    starsEl.style.display = l.star_signs?.length ? '' : 'none'
    starsEl.innerHTML = l.star_signs?.length ? `<div style="font-size:0.78rem;color:var(--mid);margin-bottom:0.4rem;font-weight:600">Looking for</div><div style="display:flex;flex-wrap:wrap;gap:0.3rem">${l.star_signs.map(s => `<span class="badge badge-type" style="font-size:0.78rem">✨ ${s}</span>`).join('')}</div>` : ''
  }

  // Music vibes (flatshare only)
  const musicEl = document.getElementById('detail-music')
  if (musicEl) {
    musicEl.style.display = l.music_vibes?.length ? '' : 'none'
    musicEl.innerHTML = l.music_vibes?.length ? `<div style="font-size:0.78rem;color:var(--mid);margin-bottom:0.4rem;font-weight:600">Music vibe</div><div style="display:flex;flex-wrap:wrap;gap:0.3rem">${l.music_vibes.map(v => `<span class="badge badge-type" style="font-size:0.78rem">🎵 ${v}</span>`).join('')}</div>` : ''
  }

  document.getElementById('detail-motto').textContent = l.motto || ''
  document.getElementById('detail-motto').style.display = l.motto ? '' : 'none'
  document.getElementById('detail-desc').textContent = l.description || ''

  // Status info
  const statusLabel = { pending: '⏳ Pending', active: '● Live', let: 'Let', expired: 'Expired' }
  document.getElementById('detail-grid').innerHTML = `
    <div style="font-size:0.8rem;color:var(--mid)">Status</div><div style="font-size:0.85rem;font-weight:600">${statusLabel[l.status] || l.status}</div>
    ${l.goes_live_at ? `<div style="font-size:0.8rem;color:var(--mid)">Goes live</div><div style="font-size:0.85rem;font-weight:600">${new Date(l.goes_live_at).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })}</div>` : ''}
    ${safeUrl(l.spotify_url) ? `<div style="font-size:0.8rem;color:var(--mid)">Spotify</div><div style="font-size:0.85rem"><a href="${safeUrl(l.spotify_url)}" target="_blank" rel="noopener" style="color:var(--accent)">🎵 Playlist</a></div>` : ''}`

  // Contact wrap — show enquiry button if logged in and not own listing
  const contactWrap = document.getElementById('detail-contact-wrap')
  if (currentUser && l.landlord_id !== currentUser.id) {
    contactWrap.innerHTML = `<button class="btn btn-primary" style="width:100%" data-listing-id="${l.id}" onclick="openEnquiryModal(this.dataset.listingId)">Message landlord →</button>`
  } else {
    contactWrap.innerHTML = ''
  }
}

function closeListing() {
  const modal = document.getElementById('listing-detail-modal')
  if (modal) modal.style.display = 'none'
}

// ── SAVE / UNSAVE LISTINGS ──
let _savedIds = new Set()

async function loadSavedIds() {
  const token = getToken()
  if (!token) return
  const data = await api('/api/listings/saved')
  _savedIds = new Set((data.listings || []).map(l => l.id))
}

async function toggleSaveListing(id, e) {
  if (e) e.stopPropagation()
  const token = getToken()
  if (!token) { toast('Sign in to save listings'); return }
  const isSaved = _savedIds.has(id)
  const btn = document.getElementById('detail-save-btn')
  if (isSaved) {
    await api(`/api/listings/${id}/save`, { method: 'DELETE' })
    _savedIds.delete(id)
    if (btn) btn.textContent = '🤍'
    toast('Removed from saved')
  } else {
    await api(`/api/listings/${id}/save`, { method: 'POST' })
    _savedIds.add(id)
    if (btn) btn.textContent = '❤️'
    toast('Saved! Find it in Renter account → Saved listings', 'green')
  }
}

let _roommateCache = []

async function loadRoommates() {
  const grid = document.getElementById('roommates-grid')
  if (!grid) return
  grid.innerHTML = '<div style="color:var(--light);font-size:0.86rem;padding:1rem">Loading…</div>'
  const data = await api('/api/roommates')
  if (data.error) { grid.innerHTML = `<div style="color:var(--light);font-size:0.86rem;padding:1rem">${data.error}</div>`; return }
  const roommates = data.roommates || []
  _roommateCache = roommates
  if (roommates.length === 0) {
    grid.innerHTML = '<div style="color:var(--light);font-size:0.86rem;padding:1rem">No one in the directory yet — be the first to opt in from your Renter account.</div>'
    return
  }
  grid.innerHTML = roommates.map(r => {
    const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Member'
    const initials = [r.first_name?.[0], r.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?'
    const jobLine = r.job_title ? `${r.job_title}${r.company ? ` at ${r.company}` : ''}` : ''
    const bio = r.bio ? (r.bio.length > 80 ? r.bio.slice(0, 77) + '…' : r.bio) : ''
    const avatarHtml = r.avatar_url
      ? `<img src="${r.avatar_url}" style="width:100%;height:100%;object-fit:cover">`
      : initials
    return `
      <div onclick="openRoommateDetail('${r.id}')" style="background:#f0f4f1;border-radius:16px;padding:1.4rem 1.4rem 1.2rem;display:flex;flex-direction:column;gap:0.5rem;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,0.08)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.2rem">
          <div style="width:40px;height:40px;border-radius:50%;background:#7C9885;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:0.95rem;flex-shrink:0;overflow:hidden">${avatarHtml}</div>
          <div>
            <div style="font-weight:700;font-size:0.95rem;color:var(--dark)">${name}</div>
            ${r.star_sign ? `<div style="font-size:0.75rem;color:var(--mid)">⭐ ${r.star_sign.charAt(0).toUpperCase() + r.star_sign.slice(1)}</div>` : ''}
          </div>
        </div>
        ${bio ? `<div style="font-size:0.82rem;color:var(--mid);line-height:1.5">${bio}</div>` : ''}
        ${jobLine ? `<div style="font-size:0.8rem;color:var(--mid)">💼 ${jobLine}</div>` : ''}
        <div style="font-size:0.78rem;color:#7C9885;font-weight:600;margin-top:0.3rem">View profile →</div>
      </div>`
  }).join('')
}

function openRoommateDetail(userId) {
  const r = _roommateCache.find(x => x.id === userId)
  if (!r) return
  const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Member'
  const initials = [r.first_name?.[0], r.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?'

  document.getElementById('rm-modal-name').textContent = name

  const avatar = document.getElementById('rm-modal-avatar')
  avatar.innerHTML = r.avatar_url ? `<img src="${r.avatar_url}" style="width:100%;height:100%;object-fit:cover">` : initials
  avatar.style.fontSize = r.avatar_url ? '' : '1.3rem'

  const jobLine = [r.job_title, r.company ? `at ${r.company}` : ''].filter(Boolean).join(' ')
  document.getElementById('rm-modal-job').textContent = jobLine ? `💼 ${jobLine}` : ''
  document.getElementById('rm-modal-sign').textContent = r.star_sign ? `⭐ ${r.star_sign.charAt(0).toUpperCase() + r.star_sign.slice(1)}` : ''

  const fields = [
    { label: 'About', value: r.bio },
    { label: 'Interests & hobbies', value: r.interests },
    { label: 'Daily schedule', value: r.daily_schedule },
    { label: 'Hopes & dreams', value: r.hopes_dreams },
    { label: 'Pet peeves', value: r.pet_peeves },
    { label: 'Hard no to…', value: r.hard_nos },
  ]
  document.getElementById('rm-modal-fields').innerHTML = fields
    .filter(f => f.value)
    .map(f => `<div><div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--mid);margin-bottom:0.2rem">${f.label}</div><div style="font-size:0.88rem;color:var(--dark);line-height:1.55">${f.value}</div></div>`)
    .join('')

  const socials = [
    safeUrl(r.instagram) ? `<a href="${safeUrl(r.instagram)}" target="_blank" rel="noopener" style="background:#f0f4f1;border:1px solid #c4d4c9;border-radius:8px;padding:0.4rem 0.8rem;font-size:0.8rem;color:#7C9885;text-decoration:none;font-weight:600">📸 Instagram</a>` : '',
    safeUrl(r.linkedin) ? `<a href="${safeUrl(r.linkedin)}" target="_blank" rel="noopener" style="background:#f0f4f1;border:1px solid #c4d4c9;border-radius:8px;padding:0.4rem 0.8rem;font-size:0.8rem;color:#7C9885;text-decoration:none;font-weight:600">🔗 LinkedIn</a>` : '',
  ].filter(Boolean)
  document.getElementById('rm-modal-socials').innerHTML = socials.join('')

  const msgBtn = document.getElementById('rm-modal-msg-btn')
  msgBtn.onclick = () => {
    document.getElementById('roommate-modal').style.display = 'none'
    openRoommateModal(userId, name)
  }

  document.getElementById('roommate-modal').style.display = 'flex'
}

async function saveRoommateOpt() {
  const checked = document.getElementById('roommate-opt-in')?.checked ?? false
  const data = await api('/api/users/me', { method: 'PATCH', body: JSON.stringify({ show_in_roommates: checked }) })
  if (data.error) { toast(data.error); return }
  toast(checked ? '✓ You are now in the roommate directory' : '✓ Removed from roommate directory')
}

async function loadSavedListings() {
  const wrap = document.getElementById('saved-listings-wrap')
  if (!wrap) return
  const token = getToken()
  if (!token) return
  // Populate roommate opt-in checkbox
  api('/api/users/me').then(d => {
    const cb = document.getElementById('roommate-opt-in')
    if (cb && d.user) cb.checked = !!d.user.show_in_roommates
  })
  const data = await api('/api/listings/saved')
  const listings = data.listings || []
  if (listings.length === 0) {
    wrap.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--light);font-size:0.86rem">No saved listings yet — browse listings and tap 🤍 to save them here.</div>'
    return
  }
  const typeIcon = { flatshare: '🏠', rental: '🏢', sublet: '🌿' }
  wrap.innerHTML = listings.map(l => `
    <div style="display:flex;align-items:center;gap:0.9rem;padding:0.85rem 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="openListing('${l.id}')">
      <span style="font-size:1.5rem;flex-shrink:0">${typeIcon[l.type] || '🏠'}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:0.88rem">${escapeHtml(l.title)}</div>
        <div style="font-size:0.75rem;color:var(--light)">📍 ${escapeHtml(l.location)}</div>
      </div>
      ${l.price ? `<div style="font-family:'Playfair Display',serif;font-size:0.95rem;font-weight:700;flex-shrink:0">£${Math.round(l.price/100).toLocaleString()}/mo</div>` : ''}
    </div>`).join('')
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
const _listingCache = {}

function openEnquiryModal(listingId) {
  if (!getToken()) { showScreen('auth'); switchTab('up'); return }
  _enquiryListingId = listingId
  const titleEl = document.getElementById('contact-listing-title')
  if (titleEl) titleEl.textContent = _listingCache[listingId]?.title || 'Contact landlord'
  const msgEl = document.getElementById('contact-message')
  if (msgEl) msgEl.value = ''
  const typeEl = document.getElementById('contact-enquiry-type')
  if (typeEl) typeEl.value = 'listing'
  const recipEl = document.getElementById('contact-recipient-id')
  if (recipEl) recipEl.value = ''
  const modal = document.getElementById('contact-modal')
  if (modal) modal.style.display = 'flex'
}

function openRoommateModal(userId, name) {
  if (!getToken()) { showScreen('auth'); return }
  const titleEl = document.getElementById('contact-listing-title')
  if (titleEl) titleEl.textContent = `Message ${name}`
  const msgEl = document.getElementById('contact-message')
  if (msgEl) msgEl.value = ''
  const typeEl = document.getElementById('contact-enquiry-type')
  if (typeEl) typeEl.value = 'roommate'
  const recipEl = document.getElementById('contact-recipient-id')
  if (recipEl) recipEl.value = userId
  _enquiryListingId = null
  const detailsEl = document.getElementById('contact-details')
  if (detailsEl) detailsEl.style.display = 'none'
  const modal = document.getElementById('contact-modal')
  if (modal) modal.style.display = 'flex'
}

async function sendEnquiry() {
  const token = getToken()
  if (!token) { showScreen('auth'); return }
  const message = document.getElementById('contact-message')?.value?.trim()
  if (!message) { toast('Please write a message first'); return }
  const enquiryType = document.getElementById('contact-enquiry-type')?.value || 'listing'
  const recipientId = document.getElementById('contact-recipient-id')?.value || ''
  const btn = document.querySelector('#contact-modal .btn-primary')
  const orig = btn?.textContent
  if (btn) btn.textContent = 'Sending…'
  const body = enquiryType === 'roommate'
    ? { enquiry_type: 'roommate', recipient_id: recipientId, message }
    : { listing_id: _enquiryListingId, message }
  const data = await api('/api/enquiries', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (btn) btn.textContent = orig
  if (data.error) { toast(data.error); return }
  document.getElementById('contact-modal').style.display = 'none'
  // Restore contact-details visibility for future listing enquiries
  const detailsEl = document.getElementById('contact-details')
  if (detailsEl) detailsEl.style.display = ''
  toast(enquiryType === 'roommate' ? '✓ Message sent!' : '✓ Message sent to landlord')
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
          ${photo ? `<img src="${photo}" alt="${escapeHtml(l.title)}">` : `<div class="lc-photo-placeholder">${typeIcon[l.type]}</div>`}
          <span class="lc-type-badge">${typeIcon[l.type]} ${l.type}</span>
        </div>
        <div class="lc-body">
          <div class="lc-price">${priceStr}</div>
          <div class="lc-title">${escapeHtml(l.title)}</div>
          <div class="lc-location">📍 ${escapeHtml(l.location)}</div>
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

  if (btn) { btn.disabled = false; btn.textContent = '📧 Send newsletter →' }

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
  ;['in', 'up', 'forgot', 'setnew'].forEach(x => {
    const el = document.getElementById('form-' + x)
    if (el) el.style.display = x === tab ? '' : 'none'
  })
  ;['in', 'up'].forEach(x => {
    const el = document.getElementById('tab-' + x)
    if (el) el.classList.toggle('active', x === tab)
  })
}

// ── CHECK URL PARAMS (return from Stripe) ──
async function checkSuccessParam() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('success') === 'listing') {
    // Activation is handled by Stripe webhook (invoice.paid) — just redirect
    window.location.href = '/listings'
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
document.addEventListener('DOMContentLoaded', async () => {
  // Show cookie banner if not yet accepted
  if (!localStorage.getItem('hf_cookies')) {
    const el = document.getElementById('cookie-banner')
    if (el) { el.style.display = 'flex' }
  }

  // Guard against double-launch (onAuthStateChange + getSession can both fire)
  let _authed = false
  let _recoveryHandled = false

  async function handleSession(session) {
    if (_authed || _recoveryHandled) return
    _authed = true
    const profile = await api('/api/users/me')
    const user = profile.user || { email: session.user.email, first_name: session.user.email?.split('@')[0] || 'You', last_name: '' }
    setSession(user, session.access_token)
    launchDash(user.first_name || user.email?.split('@')[0] || 'You', user.last_name || '')
    checkSuccessParam()
    window.history.replaceState({}, '', window.location.pathname)
  }

  // Listen for auth events — catches magic link SIGNED_IN even if getSession() fires too early
  _supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY' && !_recoveryHandled) {
      _recoveryHandled = true
      window.history.replaceState({}, '', window.location.pathname)
      showScreen('auth')
      switchTab('setnew')
      return
    }
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
      await handleSession(session)
    }
  })

  // Also handle implicit-flow recovery hash directly (belt-and-suspenders)
  const hash = new URLSearchParams(window.location.hash.slice(1))
  if (hash.get('type') === 'recovery') {
    _recoveryHandled = true
    window.history.replaceState({}, '', window.location.pathname)
    showScreen('auth')
    switchTab('setnew')
    await _supabase.auth.getSession() // let SDK exchange the token
    return
  }

  // Check for active session — covers persisted sessions and cases where SDK
  // processes the magic link hash before onAuthStateChange fires
  const { data: { session } } = await _supabase.auth.getSession()
  if (session) {
    await handleSession(session)
    return
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
  const urlParams = new URLSearchParams(window.location.search)
  const goto = urlParams.get('goto')
  const tierParam = urlParams.get('tier')
  if (goto === 'post') {
    if (tierParam) _pendingTier = tierParam
    goToPost()
  } else if (goto === 'browse') goToBrowse()
  else if (goto === 'signup') { showScreen('auth'); switchTab('up') }
  else if (goto === 'signin') { showScreen('auth'); switchTab('in') }

  // Close dropdowns on outside click
  document.addEventListener('click', e => {
    document.querySelectorAll('.star-dropdown.open, .star-sign-dropdown.open').forEach(d => {
      if (!d.closest('.star-select-wrap, .star-sign-wrap')?.contains(e.target)) {
        d.classList.remove('open')
      }
    })
  })
})
