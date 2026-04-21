-- ══════════════════════════════════════════════
-- MIGRATION 002 — Stripe subscription lifecycle
-- Run in Supabase SQL Editor
-- ══════════════════════════════════════════════

-- 1. Fix status check constraint to include 'draft'
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE public.listings ADD CONSTRAINT listings_status_check
  CHECK (status IN ('draft', 'pending', 'active', 'let', 'expired'));

-- 2. Add Stripe subscription lifecycle fields
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS stripe_subscription_id      text,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id  text,
  ADD COLUMN IF NOT EXISTS subscription_status         text,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS canceled_at                 timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at                timestamptz,
  ADD COLUMN IF NOT EXISTS last_invoice_paid_at        timestamptz,
  ADD COLUMN IF NOT EXISTS access_expires_at           timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at                  timestamptz;

-- 3. Migrate existing expires_at → access_expires_at for any already-active listings
UPDATE public.listings
  SET access_expires_at = expires_at
  WHERE access_expires_at IS NULL
    AND expires_at IS NOT NULL;

-- 4. Set activated_at for already-active listings that predate this migration
UPDATE public.listings
  SET activated_at = goes_live_at
  WHERE activated_at IS NULL
    AND status = 'active'
    AND goes_live_at IS NOT NULL;

-- 5. Update expire_old_listings() to use access_expires_at and set expired_at
CREATE OR REPLACE FUNCTION expire_old_listings()
RETURNS void LANGUAGE sql AS $$
  UPDATE public.listings
  SET
    status     = 'expired',
    expired_at = now()
  WHERE status = 'active'
    AND access_expires_at IS NOT NULL
    AND access_expires_at < now();
$$;

-- 6. Drop the now-unused activate_thursday_listings function
--    (listings go live via Stripe webhook, not Thursday scheduling)
DROP FUNCTION IF EXISTS activate_thursday_listings();
