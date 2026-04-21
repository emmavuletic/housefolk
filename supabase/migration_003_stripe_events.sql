-- ══════════════════════════════════════════════
-- MIGRATION 003 — Stripe event idempotency table
-- Run in Supabase SQL Editor after migration_002
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.stripe_events (
  id          text        PRIMARY KEY,  -- Stripe event ID (evt_...)
  type        text        NOT NULL,     -- e.g. invoice.paid
  created     timestamptz NOT NULL,     -- timestamp from Stripe
  received_at timestamptz DEFAULT now() -- when we processed it
);

-- Service role only
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to stripe_events" ON public.stripe_events
  FOR ALL USING (auth.role() = 'service_role');
