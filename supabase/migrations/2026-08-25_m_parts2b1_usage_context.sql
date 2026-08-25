-- M-PARTS2B.1 — make provider usage accounting honest.
--
-- The M-PARTS2B live proof recorded 7 calls and made 10. Two causes, and the
-- first is the serious one:
--
--   1. `oem_search` — the lookup every technician triggers — passed no usage
--      context at all, so ordinary application traffic was never counted.
--   2. Ad-hoc QA scripts had no tenant, and `recordUsage` dropped any row
--      without a shop_id.
--
-- Both are fixed in code (the context is now a required argument, so a call
-- that omits it does not compile). This migration gives those rows somewhere
-- to land.
--
-- Additive only. Existing rows keep working: `outcome` and `call_context` are
-- nullable, and the summary treats a null as ('external' | 'cache_hit') from
-- the old `cache_hit` boolean and as 'application' respectively.

-- ─── shop_id becomes nullable ────────────────────────────────────────────────
--
-- A QA script, a migration or a manual probe has no tenant, and dropping
-- those rows is precisely how 10 real requests were recorded as 7. A call
-- with no shop is still a call.
ALTER TABLE public.parts_provider_usage_events
  ALTER COLUMN shop_id DROP NOT NULL;

-- ─── Who made the call ───────────────────────────────────────────────────────
ALTER TABLE public.parts_provider_usage_events
  ADD COLUMN IF NOT EXISTS call_context TEXT;

ALTER TABLE public.parts_provider_usage_events
  DROP CONSTRAINT IF EXISTS parts_provider_usage_call_context_check;

ALTER TABLE public.parts_provider_usage_events
  ADD CONSTRAINT parts_provider_usage_call_context_check
  CHECK (call_context IS NULL OR call_context IN
    ('application', 'qa', 'migration', 'maintenance', 'manual_probe'));

-- ─── What actually happened at the network boundary ─────────────────────────
--
-- Three outcomes, kept apart. `cache_hit` as a boolean could not distinguish
-- "our cache answered" from "an identical request was already in flight and
-- this caller waited on it" — the second stores nothing, and collapsing them
-- makes the cache look more effective than it is.
ALTER TABLE public.parts_provider_usage_events
  ADD COLUMN IF NOT EXISTS outcome TEXT;

ALTER TABLE public.parts_provider_usage_events
  DROP CONSTRAINT IF EXISTS parts_provider_usage_outcome_check;

ALTER TABLE public.parts_provider_usage_events
  ADD CONSTRAINT parts_provider_usage_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('external', 'cache_hit', 'coalesced'));

-- ─── Bounded observability ──────────────────────────────────────────────────
--
-- A status CLASS and a latency, never a body, never a URL. A URL carries the
-- OEM number a shop is looking up, and a table of them becomes a record of
-- what that shop is quoting.
ALTER TABLE public.parts_provider_usage_events
  ADD COLUMN IF NOT EXISTS status_class TEXT;

ALTER TABLE public.parts_provider_usage_events
  ADD COLUMN IF NOT EXISTS latency_ms INTEGER;

ALTER TABLE public.parts_provider_usage_events
  DROP CONSTRAINT IF EXISTS parts_provider_usage_status_class_check;

ALTER TABLE public.parts_provider_usage_events
  ADD CONSTRAINT parts_provider_usage_status_class_check
  CHECK (status_class IS NULL OR status_class IN ('2xx', '3xx', '4xx', '5xx'));

-- Backfill what is knowable. Rows written before this migration came from the
-- application path, and their boolean already says whether they were external.
UPDATE public.parts_provider_usage_events
   SET call_context = COALESCE(call_context, 'application'),
       outcome      = COALESCE(outcome, CASE WHEN cache_hit THEN 'cache_hit' ELSE 'external' END)
 WHERE call_context IS NULL OR outcome IS NULL;

-- The monthly rollup, now split by who asked.
CREATE INDEX IF NOT EXISTS parts_provider_usage_context_idx
  ON public.parts_provider_usage_events (created_at DESC, call_context)
  WHERE outcome = 'external';

-- ─── Verification ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_nullable TEXT;
BEGIN
  SELECT is_nullable INTO v_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'parts_provider_usage_events'
     AND column_name = 'shop_id';

  IF v_nullable <> 'YES' THEN
    RAISE EXCEPTION 'shop_id must be nullable so untenanted calls are still counted';
  END IF;

  FOR v_nullable IN
    SELECT unnest(ARRAY['call_context', 'outcome', 'status_class', 'latency_ms'])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'parts_provider_usage_events'
         AND column_name = v_nullable
    ) THEN
      RAISE EXCEPTION 'column % was not created', v_nullable;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.parts_provider_usage_events
     WHERE call_context IS NULL OR outcome IS NULL
  ) THEN
    RAISE EXCEPTION 'backfill left rows with no call_context or outcome';
  END IF;

  -- The browser still must not be able to write its own usage rows.
  IF has_table_privilege('authenticated', 'public.parts_provider_usage_events', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated must not hold INSERT on parts_provider_usage_events';
  END IF;
END $$;
