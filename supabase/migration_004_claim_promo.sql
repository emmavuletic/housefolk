-- ══════════════════════════════════════════════════════════════════
-- MIGRATION 004 — Atomic promo code claim function
-- Run in Supabase SQL Editor after migration_003
-- ══════════════════════════════════════════════════════════════════
--
-- Replaces the non-atomic read → check → increment pattern in the
-- checkout route. A single UPDATE with a WHERE guard ensures no two
-- concurrent requests can both claim the same limited-use code.

CREATE OR REPLACE FUNCTION claim_promo_code(p_code text, p_listing_type text)
RETURNS TABLE(id uuid, discount_type text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE promo_codes
  SET uses_count = uses_count + 1
  WHERE code          = p_code
    AND active        = true
    AND (expiry IS NULL OR expiry > NOW())
    AND (max_uses IS NULL OR uses_count < max_uses)
    AND (discount_type = 'free-any' OR discount_type = 'free-' || p_listing_type)
  RETURNING promo_codes.id, promo_codes.discount_type;
END;
$$;

-- Only the service role may call this function
REVOKE ALL ON FUNCTION claim_promo_code(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_promo_code(text, text) TO service_role;
