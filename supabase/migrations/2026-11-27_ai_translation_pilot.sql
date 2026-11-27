-- AI pilot: English ⇄ Lao translation of estimate/invoice lines (Grok).
--
-- Owner approved 2026-11-27 (RedlineD1 AI Proposal, "Decisions made"):
--   * D1 Imports' own shops only; not paying customers
--   * Grok first, through the provider layer (Hermes/Anthropic later)
--   * $20/month cap with a usage meter
--   * only part/service text is sent; no customer data
--
-- ADDITIVE ONLY. One new table, one feature-flag row seeded OFF.
-- No existing table, column, trigger or row is changed.
--
-- Rollback: 2026-11-27_ai_translation_pilot_rollback.sql
-- Safe to re-run: IF NOT EXISTS / ON CONFLICT DO NOTHING.

BEGIN;

-- ── 1. Usage meter ──────────────────────────────────────────────────────────
-- One row per AI call. cost_usd is what the provider reported (cost_reported
-- = true) or an estimate from tokens. The monthly cap sums this column.
CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id        uuid        NOT NULL REFERENCES public.shops(id),
  user_id        uuid,
  feature        text        NOT NULL,
  provider       text        NOT NULL,
  model          text        NOT NULL,
  input_tokens   integer     NOT NULL DEFAULT 0,
  output_tokens  integer     NOT NULL DEFAULT 0,
  cost_usd       numeric(12,8) NOT NULL DEFAULT 0,
  cost_reported  boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_created_at_idx ON public.ai_usage_events (created_at);
CREATE INDEX IF NOT EXISTS ai_usage_events_shop_idx ON public.ai_usage_events (shop_id, created_at);

-- Server-only: written and read through the service role by /api/ai/*.
-- RLS on with no policies = no access from the browser client.
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

-- ── 2. Feature flag, OFF ────────────────────────────────────────────────────
INSERT INTO feature_flags (flag_key, display_name, description, enabled, scope)
VALUES
  ('ai_translation', 'AI translation (pilot)',
   'D1 shops only: the 🌐 button on estimate and invoice lines translates English ⇄ Lao with the AI provider (Grok). Sends only the line description. $20/month cap. Falls back to the old translator when off.',
   false, 'global')
ON CONFLICT DO NOTHING;

COMMIT;

notify pgrst, 'reload schema';

-- ── Check after running (every row should say ok) ───────────────────────────

SELECT 'ai_usage_events table' AS item,
       CASE WHEN to_regclass('public.ai_usage_events') IS NOT NULL THEN 'ok' ELSE 'MISSING' END AS status
UNION ALL
SELECT 'ai_usage_events RLS on',
       CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ai_usage_events'::regclass)
            THEN 'ok' ELSE 'CHECK RLS' END
UNION ALL
SELECT 'ai_translation flag',
       CASE WHEN EXISTS (SELECT 1 FROM feature_flags WHERE flag_key = 'ai_translation')
            THEN 'ok' ELSE 'MISSING' END;
