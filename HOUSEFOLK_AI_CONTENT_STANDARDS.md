# Housefolk AI Content Standards
*A living document governing structured content, AI-readable markup, and AI-assisted moderation across the Housefolk platform.*

---

## 1. Purpose

This document defines the content architecture and AI content standards for Housefolk — a UK housing platform connecting tenants, flatmates, and landlords. It covers:

- How content is structured in the database to support both human UX and AI systems
- How listings, profiles, and conversations are modelled as machine-readable data
- How AI moderation is applied to platform messages in production
- Editorial guidelines for AI-adjacent content across the product

This document is designed for content designers, product engineers, and anyone integrating AI tooling into the Housefolk content layer.

---

## 2. Content Model

### 2.1 Core Entity Types

Housefolk content is stored in a Supabase PostgreSQL database. The primary content entities are:

#### Listings (`listings` table)

The central content object on the platform. Each listing maps to a physical property or room.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `type` | enum | `flatshare`, `rental`, `sublet` |
| `title` | text | Human-written, required |
| `location` | text | Free-text, required; filterable via `ilike` |
| `price` | integer | Stored in pence (e.g. 150000 = £1,500/mo) |
| `beds` | integer | Number of bedrooms |
| `baths` | integer | Number of bathrooms |
| `bills_included` | boolean | Whether bills are included in price |
| `furnished` | boolean | Whether property is furnished |
| `pet_friendly` | boolean | Whether pets are allowed |
| `description` | text | Long-form property description |
| `motto` | text | One-line character summary of the home |
| `available_date` | date | When the property is available from |
| `sublet_until` | date | End date for sublets only |
| `star_signs` | text[] | Star signs of current housemates (optional, cultural signal) |
| `music_vibes` | text[] | Music genres that describe the household |
| `spotify_url` | text | Link to the household's Spotify playlist |
| `instagram` | text | Instagram handle |
| `linkedin` | text | LinkedIn profile URL |
| `airbnb` | text | Airbnb host profile URL |
| `photos` | text[] | Array of Supabase Storage URLs (max 10) |
| `status` | text | `draft` or `active` |
| `goes_live_at` | timestamptz | When listing became publicly visible |
| `expires_at` | timestamptz | Listing expires 7 days after payment; hidden from browse after this point |
| `stripe_subscription_id` | text | Stripe subscription linked to this listing |
| `landlord_id` | uuid | FK → `users.id` |

**Listing lifecycle:**
1. Landlord creates a `draft` via `POST /api/listings`
2. Payment processed via `POST /api/checkout` → Stripe webhook sets `status = active`, `goes_live_at = now()`, `expires_at = now() + 7 days`
3. On subscription renewal (`invoice.payment_succeeded`), `expires_at` is extended by 7 days
4. On subscription cancellation or refund, `expires_at` is set to `now()` — listing immediately disappears from browse
5. The browse query at `GET /api/listings` always filters `.gt('expires_at', now)` so expired listings are never shown publicly

#### Users (`users` table)

Housefolk users can be tenants, landlords, or both. The `role` field distinguishes primary intent, but the platform is role-flexible.

Key fields for AI-readable content purposes: `first_name`, `last_name`, `bio`, `star_sign`, `job_title`, `company`, `daily_schedule` (enum: `early_bird`, `night_owl`, `flexible`), `instagram`, `linkedin`, `avatar_url`, `viewing_url`.

#### Enquiries (`enquiries` table)

Created when a tenant contacts a landlord about a listing, or when two users connect via the Roommates directory.

| Field | Notes |
|---|---|
| `id` | uuid; also used as the reply-routing token in email |
| `tenant_id` | FK → `users.id` |
| `landlord_id` | FK → `users.id` |
| `listing_id` | FK → `listings.id` (null for roommate enquiries) |
| `enquiry_type` | `listing` or `roommate` |
| `message` | Initial message text |
| `read` | Boolean; toggled on open, false when new message arrives |

#### Messages (`messages` table)

Threaded replies within an enquiry conversation.

| Field | Notes |
|---|---|
| `id` | uuid |
| `enquiry_id` | FK → `enquiries.id` |
| `sender_id` | FK → `users.id` |
| `body` | Message text (max 2000 characters for initial enquiry, 1000 for replies) |
| `created_at` | Ordered ascending to display as a chat thread |

#### Supporting Tables

| Table | Purpose |
|---|---|
| `saved_listings` | Junction table: `user_id`, `listing_id`; upserted on save |
| `user_blocks` | Bidirectional block: `blocker_id`, `blocked_id` |
| `subscribers` | Newsletter: `email`, `subscribed`, `unsubscribe_token` |
| `rate_limits` | Supabase-backed distributed rate limiting: `key`, `count`, `reset_at` |
| `promo_codes` | Promotional discount codes for listing upgrades |

---

## 3. API Surface

All content operations are handled via Next.js App Router API routes under `app/api/`.

### Listings

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/listings` | GET | None | Public browse — active, non-expired listings |
| `/api/listings` | POST | Required | Create listing draft |
| `/api/listings/[id]` | GET | None | Single listing detail |
| `/api/listings/[id]` | PATCH | Required (owner) | Update listing |
| `/api/listings/[id]` | DELETE | Required (owner) | Delete listing |
| `/api/listings/[id]/save` | POST | Required | Save listing to user's list |
| `/api/listings/[id]/save` | DELETE | Required | Unsave listing |
| `/api/listings/saved` | GET | Required | Get all saved listings |
| `/api/listings/mine` | GET | Required | Get own listings |

### Messaging

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/enquiries` | POST | Required | Send initial enquiry (listing or roommate) |
| `/api/enquiries` | GET | Required | Get sent and received enquiries |
| `/api/enquiries/[id]/messages` | GET | Required (participant) | Load full message thread |
| `/api/enquiries/[id]/messages` | POST | Required (participant) | Send reply — AI moderation applied |

### Users & Safety

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/users/me` | GET/PATCH | Required | Own profile |
| `/api/users/me/avatar` | POST | Required | Upload avatar |
| `/api/users/[id]/block` | POST | Required | Block another user |
| `/api/users/[id]/report` | POST | Required | Report another user |
| `/api/roommates` | GET/POST | Mixed | Roommate directory browse |

### Payments & Email

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/checkout` | POST | Required | Create Stripe checkout session |
| `/api/checkout/confirm` | POST | Required | Confirm payment, activate listing |
| `/api/webhook` | POST | Stripe sig | Handle Stripe webhook events |
| `/api/email/inbound` | POST | HMAC | Handle inbound email replies (Resend) |
| `/api/photos` | POST | Required | Upload listing photos to Supabase Storage |
| `/api/subscribers` | POST | None | Subscribe to newsletter |
| `/api/subscribers/unsubscribe` | GET | HMAC token | Unsubscribe |
| `/api/newsletter/send` | POST | Admin | Send newsletter via Resend |

---

## 4. AI Workflow: Message Moderation

### 4.1 Overview

All reply messages sent via `POST /api/enquiries/[id]/messages` pass through a two-tier content moderation system before being stored or forwarded. This is a production AI system running on every message sent on the platform.

**Stack:** Claude Haiku (`claude-haiku-4-5-20251001`) via the Anthropic SDK
**Fallback:** Keyword blocklist (always runs first)
**File:** `app/api/enquiries/[id]/messages/route.ts`

### 4.2 Moderation Architecture

```
User sends message
       ↓
[Tier 1] Keyword blocklist check
  Hit → Block immediately, return 400
  Clear → Continue
       ↓
[Tier 2] Claude Haiku moderation call
  BLOCK: <reason> → Return 400 to user
  OK → Continue
  API error → Fail open (keyword check already ran)
       ↓
Insert into `messages` table
Email notification sent to recipient via Resend
```

### 4.3 Keyword Blocklist

The blocklist acts as a fast, zero-latency first pass to catch clear-cut violations before hitting the AI API:

```typescript
const BLOCKED_KEYWORDS = [
  'fuck', 'cunt', 'nigger', 'faggot',
  'kill yourself', 'kys', 'i will kill', "i'll kill", 'rape'
]
```

If any keyword is matched (case-insensitive substring check), the message is immediately rejected with: `"Message contains prohibited content."`

### 4.4 Claude Haiku Moderation Prompt

When the keyword check passes, the message is sent to Claude Haiku with this prompt:

> *You are a content moderator for a UK housing platform. Review this message and reply with only "OK" if it is acceptable, or "BLOCK: \<brief reason\>" if it contains obscenities, sexual content, threats, harassment, or hate speech. Message: """[message text]"""*

**Model parameters:**
- Model: `claude-haiku-4-5-20251001`
- Max tokens: 50 (structured output only — no prose needed)
- Single-turn, no memory

**Output parsing:**
- Response starts with `"BLOCK:"` → extract reason, return 400 to user
- Any other response → allow message through

**User-facing error message (on block):**
> *"Your message was not sent — it contains content that isn't allowed on Housefolk."*

The platform deliberately does not expose the AI's specific reason to the user, only a neutral platform policy statement.

### 4.5 Failure Handling

If the Anthropic API is unavailable (network error, timeout, rate limit), the system fails open — the message is allowed through. This is an intentional design trade-off: the keyword blocklist has already run, so the most egregious content is still caught. Temporary AI unavailability should not block legitimate user communication on a housing platform.

### 4.6 Scope

The AI moderation system applies specifically to **threaded replies** (`messages` table). Initial enquiry messages (`enquiries.message`) do not currently pass through AI moderation — they have a 2000-character limit and are rate-limited to 5 per IP per hour at `POST /api/enquiries`.

### 4.7 Moderation Coverage Summary

| Message type | Keyword check | AI moderation | Rate limit |
|---|---|---|---|
| Initial enquiry (`POST /api/enquiries`) | No | No | Yes (5/hr per IP) |
| Thread reply (`POST /api/enquiries/[id]/messages`) | Yes | Yes | No |
| Inbound email reply (`POST /api/email/inbound`) | No | No | Webhook auth only |

---

## 5. Email Content System

### 5.1 Transactional Email

All transactional email is sent via Resend (`lib/resend.ts`). The `FROM_EMAIL` and `ADMIN_EMAIL` are set via environment variables.

#### Enquiry notification email

When a tenant sends an initial enquiry, the landlord receives a rich HTML email containing:
- Sender's profile card (avatar, name, job title, company, star sign, daily schedule, bio)
- Social links (Instagram, LinkedIn) — validated and sanitised before rendering
- The message body (HTML-escaped)
- A CTA button linking to `https://app.housefolk.co/housefolk.html?inbox={enquiry_id}`
- A `reply_to` address: `reply+{enquiry_id}@inbound.housefolk.co`

#### Reply notification email

When either participant replies via the app (`POST /api/enquiries/[id]/messages`), the other party receives a simpler email:
- Message body in a blockquote (HTML-escaped)
- `reply_to: reply+{enquiry_id}@inbound.housefolk.co`
- Link to view in app

### 5.2 Inbound Email Routing

Email replies route back into the platform via Resend's inbound webhook at `POST /api/email/inbound`.

**Flow:**
1. Recipient replies to email
2. Resend routes to the inbound webhook
3. Webhook extracts `enquiry_id` from the `reply+{id}@inbound.housefolk.co` address
4. Validates sender email against `enquiry.tenant.email` or `enquiry.landlord.email`
5. Strips quoted reply text (removes `>` lines, "On ... wrote:" blocks, horizontal rules)
6. Inserts cleaned body (max 2000 chars) into `messages` table
7. Forwards notification email to the other party

**Security:** Webhook is verified via a secret passed in the `x-webhook-secret` header, compared with `timingSafeEqual` to prevent timing attacks.

**Note:** Inbound email replies bypass the AI moderation system — they are inserted directly. This is a known gap; moderation for inbound replies is a future consideration.

---

## 6. Structured Content for GEO

*GEO = Generative Engine Optimisation — designing content for discoverability by AI-powered search and answer engines.*

### 6.1 Content Design Principles

Housefolk content is authored to be:

- **Atomic** — each field (`title`, `description`, `motto`, `location`) carries a single, separable meaning
- **Typed** — structured fields (`type`, `star_signs`, `music_vibes`, `daily_schedule`) are enums, not free text, enabling consistent AI interpretation
- **Self-describing** — listing descriptions are written to answer likely natural-language search queries without relying on metadata context

### 6.2 Listing Content Guidelines

#### `title` (required)

Short, descriptive, factual. Should include property type and location as a minimum.

- ✅ `"Sunny double room in Peckham flatshare"`
- ✅ `"2-bed rental near Hackney Central"`
- ❌ `"Beautiful home!!!"` — no location, no type signal
- ❌ `"Room"` — too sparse for AI indexing or user scanning

#### `motto` (optional but recommended)

One sentence that captures the personality of the home or household. This is the field most likely to be surfaced by AI in a summary or card.

- ✅ `"A quiet house for working professionals who love vinyl and long walks"`
- ✅ `"Creative chaos — we work from home, host dinner parties, and have a very friendly cat"`
- ❌ `"Nice place, good location"` — generic, adds no signal
- Max ~160 characters recommended for AI snippet compatibility

#### `description` (optional)

Full property and household description. Structure matters:

- Lead with the most searchable facts (property type, location, transport links)
- Follow with household character and lifestyle cues
- Avoid abbreviations — AI language models and screen readers both interpret unabbreviated text more reliably
- Do not repeat information already captured in typed fields (`beds`, `baths`, `bills_included`) — let the structured fields carry that weight

#### `star_signs`, `music_vibes` (array fields)

These are cultural personality signals, not search-optimised fields. They inform recommendation logic and community matching rather than GEO.

- `star_signs`: Array of zodiac signs of current housemates. Used for social proof and vibe-matching.
- `music_vibes`: Array of music genre strings (e.g. `["jazz", "indie", "hip-hop"]`). Displayed as taste signals.

### 6.3 Schema.org Alignment

Housefolk listing content maps approximately to `schema.org/Accommodation`:

| Housefolk field | Schema.org equivalent |
|---|---|
| `title` | `name` |
| `description` | `description` |
| `location` | `address` |
| `price` | `offers.price` |
| `beds` | `numberOfRooms` |
| `available_date` | `availabilityStarts` |
| `type` | `@type` (RentAction / Accommodation) |

For future structured data markup (JSON-LD), listing pages should emit these fields in a machine-readable format to maximise GEO discoverability.

---

## 7. Content Safety Architecture

### 7.1 Platform Content Policy

Housefolk is a UK housing platform. Content policy is modelled on UK-specific legal context (Equality Act 2010) and the platform's community values.

**Prohibited content categories:**
- Discriminatory language (race, religion, sex, disability, sexual orientation, age)
- Sexual content or solicitation
- Threats, harassment, or abuse
- Content designed to circumvent the platform's messaging system (e.g. sharing personal contact details to avoid Resend routing)

### 7.2 Moderation Layers

| Layer | What it covers | Where it runs |
|---|---|---|
| Input validation | Length limits, required fields | API routes (server-side) |
| Keyword blocklist | Hard-coded slurs and threats | `POST /api/enquiries/[id]/messages` |
| AI moderation (Claude Haiku) | Contextual nuance — harassment, sexual content | `POST /api/enquiries/[id]/messages` |
| Block system | User-initiated protection | `user_blocks` table; checked on every message send |
| Report system | Escalation for human review | `POST /api/users/[id]/report` |
| Rate limiting | Prevents bulk spam | Supabase-backed (`rate_limits` table), applied at enquiry creation |

### 7.3 Block and Report Flow

When a user is blocked:
- Both `blocker_id → blocked_id` and `blocked_id → blocker_id` rows are checked in `user_blocks` before any message is allowed
- Blocked users cannot send or receive messages in the affected conversation
- The check is performed with two parallel queries (not an OR clause) for reliability

When a user is reported:
- The report is stored for admin review
- The reporting user is not notified of any outcome (to avoid gaming the system)

---

## 8. Editorial Voice

### 8.1 Platform Voice

Housefolk speaks with a warm, direct, modern British voice. It is:

- **Warm but not sycophantic** — we acknowledge the person, not their actions
- **Direct** — short sentences, active voice
- **British English** — "Unauthorised", "colour", "favourite"
- **Human** — we say "you", not "the user"

### 8.2 Error Messages

Error messages should be honest, clear, and actionable. They should not expose internal implementation details.

**API error messages (current production examples):**

| Context | Message |
|---|---|
| Unauthenticated | `"Unauthorised."` |
| Listing not found | `"Listing not found."` |
| Access denied | `"Forbidden."` |
| Duplicate enquiry | `"You have already sent an enquiry for this listing."` |
| Message too long | `"Message too long (max 1000 characters)."` |
| Message blocked by moderation | `"Your message was not sent — it contains content that isn't allowed on Housefolk."` |
| Rate limited | `"Too many messages. Please wait before sending again."` |
| Cannot message (blocked) | `"You cannot send messages in this conversation."` |

### 8.3 AI-Generated Content Policy

Housefolk does not currently generate listing copy via AI. All `title`, `description`, and `motto` content is authored by the landlord or tenant.

AI is used exclusively for:
1. Content moderation (message screening)
2. Potential future: search and recommendation logic

If AI-generated listing copy is introduced, it must be:
- Clearly labelled or reviewed before publish
- Checked against the listing guidelines in §6.2
- Not permitted to fabricate factual claims (beds, price, location)

---

## 9. Content Governance

### 9.1 Listing Expiry and Content Freshness

All active listings are time-bounded. `expires_at` is set to 7 days after payment and renewed on `invoice.payment_succeeded` Stripe events. This ensures:

- The browse index (`GET /api/listings`) only surfaces live, paid content
- Stale listings do not accumulate in AI training pipelines or scrapers
- Tenants are never misled by old listings

### 9.2 Photo Content

Photos are uploaded via `POST /api/photos` to Supabase Storage. Filenames are generated using `crypto.randomBytes(8).toString('hex')` to prevent enumeration. A maximum of 10 photos per listing is enforced at the API layer.

Photos do not currently pass through AI analysis or auto-tagging. Alt text is not yet structured — this is a future accessibility and GEO improvement opportunity.

### 9.3 Newsletter Content

Newsletter emails are sent via `POST /api/newsletter/send` (admin-only). The `intro` field is HTML-escaped before rendering to prevent injection. Unsubscribe links use HMAC-signed tokens verified at `GET /api/subscribers/unsubscribe`.

---

## 10. Changelog

| Date | Change |
|---|---|
| 2026-04-14 | Initial version. Added Claude Haiku moderation case study, real schema, full API surface, GEO guidelines. |

---

*This document is maintained by the Housefolk product team. For questions, contact emma@housefolk.co.*
