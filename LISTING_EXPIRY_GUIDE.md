# Housefolk — Listing Payment & 7-Day Expiry Guide

## How It Works (Overview)

When a landlord pays for a listing, it goes live immediately and stays visible for 7 days.
If their Stripe subscription auto-renews, the listing gets another 7 days. If they cancel or
payment fails, the listing disappears.

---

## The Full Flow

### Step 1 — Landlord posts and pays
1. Landlord fills in listing form and clicks "Post listing"
2. A draft listing is created in the database (`status = draft`)
3. Landlord is sent to Stripe checkout
4. On successful payment, Stripe fires a `checkout.session.completed` event

### Step 2 — Listing goes live
The Stripe webhook (`/api/webhook`) receives `checkout.session.completed` and:
- Sets `status = active`
- Sets `goes_live_at = now`
- Sets `expires_at = now + 7 days`
- Sends the landlord a confirmation email

### Step 3 — Listing is visible on browse
The browse page (`/api/listings`) only shows listings where:
- `status = active` AND
- `expires_at` is in the future

So a listing automatically disappears on day 8 without any manual action.

### Step 4 — Weekly renewal (subscription continues)
On day 7, Stripe automatically charges the landlord again.
If payment succeeds, Stripe fires `invoice.payment_succeeded` and the webhook:
- Extends `expires_at` by another 7 days
- Keeps `status = active`

The listing stays live seamlessly.

### Step 5 — Cancellation or payment failure
If the landlord cancels, or their card fails:
- Stripe fires `customer.subscription.deleted` or sets subscription to `past_due`/`unpaid`
- The webhook sets `status = expired`
- The listing disappears from browse immediately

---

## Database Fields Involved

| Field | Table | What It Means |
|-------|-------|---------------|
| `status` | listings | `draft` / `active` / `expired` |
| `expires_at` | listings | When the listing stops showing |
| `goes_live_at` | listings | When it was activated (paid) |
| `stripe_subscription_id` | listings | Links listing to its Stripe subscription |

---

## Stripe Events the Webhook Listens To

| Event | What It Does |
|-------|-------------|
| `checkout.session.completed` | Activates listing, sets 7-day expiry |
| `invoice.payment_succeeded` | Extends expiry 7 more days on renewal |
| `customer.subscription.deleted` | Expires listing immediately |
| `customer.subscription.updated` | Expires listing if status is past_due/unpaid/canceled |

**Important:** All four of these must be enabled in your Stripe webhook settings.
Go to: Stripe → Developers → Webhooks → your endpoint → add missing events.

---

## Code Locations

| What | File |
|------|------|
| Webhook handler | `app/api/webhook/route.ts` |
| Browse query (expiry filter) | `app/api/listings/route.ts` |
| Payment confirm fallback | `app/api/checkout/confirm/route.ts` |
| Stripe price IDs | `lib/stripe.ts` |

---

## Troubleshooting

### Listing not going live after payment

1. Check **Stripe → Developers → Webhooks → your endpoint → Event deliveries**
   - Look for `checkout.session.completed` — did it arrive?
   - If it shows a failure, click it to see the error response
2. Check **Supabase → listings table**
   - Is `status` still `draft`? Webhook didn't fire or failed
   - Is `expires_at` null? Webhook fired but old code ran (redeploy)
3. Check **Vercel → Logs** for errors in `/api/webhook`

### Listing disappears before 7 days

1. Check **Supabase → listings** — what is `expires_at`?
   - If it's in the past, the renewal webhook didn't fire
2. Check **Stripe → Subscriptions** — is the subscription still active?
3. Check Stripe webhook has `invoice.payment_succeeded` enabled

### Listing stays visible after cancellation

1. Check **Stripe → Subscriptions** — is it actually cancelled?
2. Check **Stripe webhook → Event deliveries** — did `customer.subscription.deleted` fire?
3. Manually expire in Supabase SQL Editor:
   ```sql
   UPDATE listings SET status = 'expired' WHERE stripe_subscription_id = 'sub_xxx';
   ```

### Listing not showing on browse page at all

1. Check `status = active` in Supabase
2. Check `expires_at` is in the future
3. Hard refresh the browse page (Cmd+Shift+R) to bypass cache

### Testing expiry manually

To make a listing expire immediately (for testing):
```sql
UPDATE listings
SET expires_at = now() - interval '1 minute'
WHERE id = 'your-listing-id';
```

To restore it:
```sql
UPDATE listings
SET expires_at = now() + interval '7 days'
WHERE id = 'your-listing-id';
```

---

## Pricing (as of April 2026)

| Type | Weekly Price |
|------|-------------|
| Flatshare | £15/week |
| Apartment Rental | £15/week |
| Sublet | £20/week |

Prices are set in `lib/stripe.ts` as Stripe Price IDs.
To change pricing, create new prices in Stripe dashboard and update the IDs in that file.
