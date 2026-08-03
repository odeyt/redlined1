-- Per-shop default currency for quotes, estimates and parts.
--
-- Until now the default was hardcoded 'USD' in the Parts Quotations form and
-- nowhere else, so a shop working in baht re-picked its currency on every
-- quote — and when it forgot, the line was stored as USD while the screen
-- showed THB. That mismatch was repaired on 2026-08-03; this removes the
-- reason it happened.
--
-- USD for every new shop. The product sells worldwide and USD is the safest
-- starting point for a shop we know nothing about; a shop that works in another
-- currency sets it once in Settings.
--
-- ── Deliberately DEFAULT 'USD' and NOT NULL ────────────────────────────────
--
-- Existing rows take 'USD' too, which changes nothing: USD was already the
-- hardcoded default they were getting. The application also treats NULL as
-- USD, so the two agree even if a row is inserted around this default.
--
-- This sets only what NEW records default to. No existing quote, estimate or
-- part is rewritten — their currency is already recorded per line, and
-- reinterpreting historical prices would be a pricing change, not a migration.

BEGIN;

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS default_currency TEXT NOT NULL DEFAULT 'USD';

COMMENT ON COLUMN public.shop_settings.default_currency IS
  'ISO 4217 code new quotes/estimates/parts default to. USD for new shops; changed in Settings. Per-line currency still overrides.';

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────────
--
-- Every shop should now have a default, and D1''s own shops should show USD
-- until they choose otherwise:
--
--   SELECT s.name, ss.default_currency
--   FROM public.shop_settings ss
--   JOIN public.shops s ON s.id = ss.shop_id
--   ORDER BY s.name;
--
-- Nothing historical should have moved — line currencies are stored per item
-- and are untouched by this migration:
--
--   SELECT currency, count(*)
--   FROM public.parts_estimates
--   GROUP BY currency;
