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

#### Listings

The central content object on the platform. Each listing maps to a physical property or room.

Field | Type | Notes
--- | --- | ---
type | enum | flatshare, rental, sublet
title | text | Human-written, required
location | text | Free-text, required; filterable
price | integer | Stored in pence (e.g. 150000 = £1,500/mo)
beds | integer | Number of bedrooms
baths | integer | Number of bathrooms
bills_included | boolean | Whether bills are included in price
furnished | boolean | Whether property is furnished
pet_friendly | boolean | Whether pets are allowed
description | text | Long-form property description
motto | text | One-line character summary of the home
available_date | date | When the property is available from
sublet_until | date | End date for sublets only
star_signs | text[] | Star signs of current housemates
music_vibes | text[] | Music genres that describe the household
spotify_url | text | Link to the household's Spotify playlist
photos | text[] | Array of image URLs (max 10)
status | text | draft or active
goes_live_at | timestamptz | When listing became publicly visible
expires_at | timestamptz | Listing expires 7 days after payment

**Listing lifecycle:**
1. Landlord creates a draft
2. Payment processed — listing becomes active with a 7-day window
3. On subscription renewal, the window extends by 7 days
4. On cancellation or refund, the listing immediately disappears from browse
5. The browse query always filters by expiry date so stale listings are never shown publicly

#### Users

Housefolk users can be tenants, landlords, or both. The platform is role-flexible.

Key content fields: first_name, last_name, bio, star_sign, job_title, company, daily_schedule (early_bird, night_owl, flexible), instagram, linkedin, avatar_url.

#### Enquiries

Created when a tenant contacts a landlord about a listing, or when two users connect via the Roommates directory.

Field | Notes
--- | ---
tenant_id | The person who sent the message
landlord_id | The person who received it
listing_id | The listing in question (null for roommate-to-roommate messages)
enquiry_type | listing or roommate
message | Initial message text
read | Boolean; false when a new message arrives

#### Messages

Threaded replies within an enquiry conversation.

Field | Notes
--- | ---
enquiry_id | Links to the parent enquiry
sender_id | Who sent this message
body | Message text (max 2000 chars for initial enquiry, 1000 for replies)
created_at | Ordered ascending to display as a chat thread

---

## 3. API Surface

All content operations are handled via a Next.js API layer.

### Listings

Endpoint | Method | Auth | Description
--- | --- | --- | ---
/api/listings | GET | None | Public browse — active, non-expired listings
/api/listings | POST | Required | Create listing draft
/api/listings/[id] | GET | None | Single listing detail
/api/listings/[id] | PATCH | Required (owner) | Update listing
/api/listings/[id] | DELETE | Required (owner) | Delete listing
/api/listings/[id]/save | POST | Required | Save listing to user's list
/api/listings/[id]/save | DELETE | Required | Unsave listing
/api/listings/saved | GET | Required | Get all saved listings
/api/listings/mine | GET | Required | Get own listings

### Messaging

Endpoint | Method | Auth | Description
--- | --- | --- | ---
/api/enquiries | POST | Required | Send initial enquiry (listing or roommate)
/api/enquiries | GET | Required | Get sent and received enquiries
/api/enquiries/[id]/messages | GET | Required (participant) | Load full message thread
/api/enquiries/[id]/messages | POST | Required (participant) | Send reply — AI moderation applied

### Users & Safety

Endpoint | Method | Auth | Description
--- | --- | --- | ---
/api/users/me | GET/PATCH | Required | Own profile
/api/users/[id]/block | POST | Required | Block another user
/api/users/[id]/report | POST | Required | Report another user
/api/roommates | GET/POST | Mixed | Roommate directory browse

### Payments & Email

Endpoint | Method | Auth | Description
--- | --- | --- | ---
/api/checkout | POST | Required | Create Stripe checkout session
/api/webhook | POST | Stripe sig | Handle Stripe webhook events
/api/email/inbound | POST | Verified | Handle inbound email replies
/api/photos | POST | Required | Upload listing photos
/api/subscribers | POST | None | Subscribe to newsletter
/api/subscribers/unsubscribe | GET | Signed token | Unsubscribe
/api/newsletter/send | POST | Admin | Send newsletter

---

## 4. AI Workflow: Message Moderation

### 4.1 Overview

All reply messages pass through a two-tier content moderation system before being stored or forwarded. This is a production AI system running on every message sent on the platform.

Stack: Claude Haiku (claude-haiku-4-5-20251001) via the Anthropic SDK
Fallback: Keyword blocklist (always runs first)

### 4.2 Moderation Architecture

    User sends message
           |
    [Tier 1] Keyword blocklist check
      Hit → Block immediately
      Clear → Continue
           |
    [Tier 2] Claude Haiku moderation call
      BLOCK: <reason> → Message rejected
      OK → Continue
           |
    Message stored and email notification sent to recipient

### 4.3 Keyword Blocklist

The blocklist acts as a fast, zero-latency first pass to catch clear-cut violations before hitting the AI API. It checks for hard-coded slurs, explicit threats, and the most severe prohibited terms (case-insensitive substring match).

If any keyword is matched, the message is immediately rejected with: "Message contains prohibited content."

### 4.4 Claude Haiku Moderation Prompt

When the keyword check passes, the message is sent to Claude Haiku with this prompt:

"You are a content moderator for a UK housing platform. Review this message and reply with only 'OK' if it is acceptable, or 'BLOCK: <brief reason>' if it contains obscenities, sexual content, threats, harassment, or hate speech. Message: """[message text]""""

Model parameters:
- Model: claude-haiku-4-5-20251001
- Max tokens: 50 (structured output only — no prose needed)
- Single-turn, no memory

Output parsing:
- Response starts with "BLOCK:" → message rejected
- Any other response → message allowed through

User-facing error message (on block):
"Your message was not sent — it contains content that isn't allowed on Housefolk."

The platform deliberately does not expose the AI's specific reason to the user, only a neutral platform policy statement.

### 4.5 Scope

The AI moderation system applies to threaded replies. Initial enquiry messages have a 2000-character limit and are rate-limited to 5 per IP per hour.

### 4.6 Moderation Coverage Summary

Message type | Keyword check | AI moderation | Rate limit
--- | --- | --- | ---
Initial enquiry | No | No | Yes (5/hr per IP)
Thread reply | Yes | Yes | No
Inbound email reply | No | No | Webhook auth only

---

## 5. Email Content System

### 5.1 Transactional Email

All transactional email is sent via Resend. FROM_EMAIL and ADMIN_EMAIL are set via environment variables.

When a tenant sends an initial enquiry, the landlord receives a rich HTML email containing:
- Sender's profile card (avatar, name, job title, company, star sign, daily schedule, bio)
- Social links (Instagram, LinkedIn) — validated and sanitised before rendering
- The message body (HTML-escaped)
- A CTA button linking to the inbox thread in the app
- A reply-to address that routes replies back into the platform

When either participant replies via the app, the other party receives a simpler email with the message body in a blockquote and the same reply-to routing.

### 5.2 Inbound Email Routing

Email replies route back into the platform via Resend's inbound webhook.

Flow:
1. Recipient replies to the notification email
2. Resend routes to the inbound webhook
3. Webhook identifies the conversation from the reply-to address
4. Validates sender email against conversation participants
5. Strips quoted reply text (removes quoted lines and thread separators)
6. Inserts cleaned body (max 2000 chars) into the messages table
7. Forwards a notification email to the other party

---

## 6. Structured Content for GEO

GEO = Generative Engine Optimisation — designing content for discoverability by AI-powered search and answer engines.

### 6.1 Content Design Principles

Housefolk content is authored to be:

- Atomic — each field (title, description, motto, location) carries a single, separable meaning
- Typed — structured fields (type, star_signs, music_vibes, daily_schedule) are enums, not free text, enabling consistent AI interpretation
- Self-describing — listing descriptions are written to answer likely natural-language search queries without relying on metadata context

### 6.2 Listing Content Guidelines

**title (required)**

Short, descriptive, factual. Should include property type and location as a minimum.

Good: "Sunny double room in Peckham flatshare"
Good: "2-bed rental near Hackney Central"
Bad: "Beautiful home!!!" — no location, no type signal
Bad: "Room" — too sparse for AI indexing or user scanning

**motto (optional but recommended)**

One sentence that captures the personality of the home or household. This is the field most likely to be surfaced by AI in a summary or card.

Good: "A quiet house for working professionals who love vinyl and long walks"
Good: "Creative chaos — we work from home, host dinner parties, and have a very friendly cat"
Bad: "Nice place, good location" — generic, adds no signal
Max ~160 characters recommended for AI snippet compatibility.

**description (optional)**

Full property and household description. Structure matters:

- Lead with the most searchable facts (property type, location, transport links)
- Follow with household character and lifestyle cues
- Avoid abbreviations — AI language models and screen readers both interpret unabbreviated text more reliably
- Do not repeat information already captured in typed fields (beds, baths, bills_included) — let the structured fields carry that weight

**star_signs, music_vibes (array fields)**

These are cultural personality signals, not search-optimised fields. They inform recommendation logic and community matching rather than GEO.

### 6.3 Schema.org Alignment

Housefolk listing content maps approximately to schema.org/Accommodation:

Housefolk field | Schema.org equivalent
--- | ---
title | name
description | description
location | address
price | offers.price
beds | numberOfRooms
available_date | availabilityStarts
type | @type (RentAction / Accommodation)

For future structured data markup (JSON-LD), listing pages should emit these fields in a machine-readable format to maximise GEO discoverability.

---

## 7. Content Safety Architecture

### 7.1 Platform Content Policy

Housefolk is a UK housing platform. Content policy is modelled on UK-specific legal context (Equality Act 2010) and the platform's community values.

Prohibited content categories:
- Discriminatory language (race, religion, sex, disability, sexual orientation, age)
- Sexual content or solicitation
- Threats, harassment, or abuse
- Content designed to circumvent the platform's messaging system

### 7.2 Moderation Layers

Layer | What it covers
--- | ---
Input validation | Length limits, required fields — enforced server-side
Keyword blocklist | Hard-coded slurs and threats
AI moderation (Claude Haiku) | Contextual nuance — harassment, sexual content, threats
Block system | User-initiated protection; checked on every message send
Report system | Escalation for human review
Rate limiting | Prevents bulk spam at the point of enquiry creation

### 7.3 Block and Report Flow

When a user is blocked:
- Both directions are checked before any message is allowed
- Blocked users cannot send or receive messages in the affected conversation

When a user is reported:
- The report is stored for admin review
- The reporting user is not notified of any outcome (to avoid gaming the system)

---

## 8. Editorial Voice

### 8.1 Platform Voice

Housefolk speaks with a warm, direct, modern British voice. It is:

- Warm but not sycophantic — we acknowledge the person, not their actions
- Direct — short sentences, active voice
- British English — "Unauthorised", "colour", "favourite"
- Human — we say "you", not "the user"

### 8.2 Error Messages

Error messages should be honest, clear, and actionable. They should not expose internal implementation details.

Current production error messages:

Context | Message
--- | ---
Unauthenticated | "Unauthorised."
Listing not found | "Listing not found."
Access denied | "Forbidden."
Duplicate enquiry | "You have already sent an enquiry for this listing."
Message too long | "Message too long (max 1000 characters)."
Message blocked by moderation | "Your message was not sent — it contains content that isn't allowed on Housefolk."
Rate limited | "Too many messages. Please wait before sending again."
Cannot message (blocked) | "You cannot send messages in this conversation."

### 8.3 AI-Generated Content Policy

Housefolk does not currently generate listing copy via AI. All title, description, and motto content is authored by the landlord or tenant.

AI is used exclusively for:
1. Content moderation (message screening)
2. Potential future: search and recommendation logic

If AI-generated listing copy is introduced, it must be clearly labelled or reviewed before publish, checked against the listing guidelines in section 6.2, and must not fabricate factual claims (beds, price, location).

---

## 9. Content Governance

### 9.1 Listing Expiry and Content Freshness

All active listings are time-bounded — they expire 7 days after payment and renew with the subscription. This ensures:

- The browse index only surfaces live, paid content
- Stale listings do not accumulate in AI training pipelines or scrapers
- Tenants are never misled by old listings

### 9.2 Photo Content

Photos are uploaded to cloud storage. A maximum of 10 photos per listing is enforced at the API layer. Photos do not currently pass through AI analysis or auto-tagging. Alt text is not yet structured — this is a future accessibility and GEO improvement opportunity.

### 9.3 Newsletter Content

Newsletter emails are admin-only. Content is sanitised before sending. Unsubscribe links use cryptographically signed tokens.

---

## 10. Changelog

Date | Change
--- | ---
2026-04-14 | Initial external version. Adapted from internal standards document.

---

*This document is maintained by the Housefolk product team. For questions, contact emma@housefolk.co.*
