-- M-PARTS2C.3 — a reference cache that survives a deployment.
--
-- The existing cache is an in-process Map. On Vercel every deployment and
-- every cold start empties it, so resolving one vehicle re-pays three
-- provider calls: manufacturers, models, vehicle_variants. Measured during
-- M-PARTS2C.2 validation, a redeploy mid-run cost the entire remaining
-- budget. On a small free quota that is the dominant cost.
--
-- This is catalogue data, NOT tenant data: the same manufacturer list answers
-- every shop. So there is no shop_id, and no RLS policy — nothing but the
-- server (service_role) may read or write it.
--
-- WHAT MUST NEVER LAND HERE: a search term, an OEM number, a VIN, a customer
-- reference, or an API key. Only reference endpoints are cached, and their
-- paths carry catalogue ids alone. The application enforces this too — see
-- isPersistable() in lib/parts/vehicleResolution/referenceCache.ts — because
-- a rule kept in one place is a rule that gets forgotten in the other.
--
-- Additive. Nothing existing changes behaviour.

CREATE TABLE IF NOT EXISTS public.parts_provider_reference_cache (
  -- The provider PATH. It already encodes every dimension that changes the
  -- answer — type, manufacturer, model, language, market filter — so a key
  -- built by hand from a subset of those is how one manufacturer's models
  -- get served for another.
  cache_key    TEXT PRIMARY KEY,
  category     TEXT NOT NULL,
  payload      JSONB NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sweeping expired rows, and the only access pattern besides key lookup.
CREATE INDEX IF NOT EXISTS parts_provider_reference_cache_expires_idx
  ON public.parts_provider_reference_cache (expires_at);

ALTER TABLE public.parts_provider_reference_cache ENABLE ROW LEVEL SECURITY;

-- Supabase grants anon and authenticated DML on new public tables by default.
-- Revoking from PUBLIC also strips service_role's inherited privileges, so the
-- grant is restated rather than assumed.
REVOKE ALL ON public.parts_provider_reference_cache FROM PUBLIC;
REVOKE ALL ON public.parts_provider_reference_cache FROM anon, authenticated;
GRANT ALL ON public.parts_provider_reference_cache TO service_role;

-- A persistent hit is a different fact from a memory hit: it is what proves
-- the cache survived a deployment. Recording both as `cache_hit` would make
-- that unobservable.
ALTER TABLE public.parts_provider_usage_events
  DROP CONSTRAINT IF EXISTS parts_provider_usage_outcome_check;

ALTER TABLE public.parts_provider_usage_events
  ADD CONSTRAINT parts_provider_usage_outcome_check
  CHECK (outcome IS NULL OR outcome IN (
    'external', 'cache_hit', 'coalesced',
    'persistent_hit'  -- M-PARTS2C.3
  ));

DO $$
DECLARE
  v_count INT;
BEGIN
  -- The table exists, WITH a negative control. A head-count check once
  -- reported a table that does not exist as present, so existence is never
  -- asserted without something that must fail beside it.
  PERFORM 1 FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'parts_provider_reference_cache';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reference cache table was not created';
  END IF;

  PERFORM 1 FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'definitely_not_a_real_table_xyz';
  IF FOUND THEN
    RAISE EXCEPTION 'existence check is broken: it found a table that does not exist';
  END IF;

  -- The new outcome is accepted.
  BEGIN
    INSERT INTO public.parts_provider_usage_events
      (shop_id, endpoint_category, call_context, outcome, cache_hit, success)
    VALUES (NULL, 'manufacturers', 'migration', 'persistent_hit', TRUE, TRUE);
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'persistent_hit is still rejected by the outcome constraint';
  END;

  DELETE FROM public.parts_provider_usage_events
   WHERE call_context = 'migration';

  -- And an unknown one is still refused. A constraint that accepts everything
  -- is not a constraint.
  BEGIN
    INSERT INTO public.parts_provider_usage_events
      (shop_id, endpoint_category, call_context, outcome, cache_hit, success)
    VALUES (NULL, 'manufacturers', 'migration', 'not-a-real-outcome', TRUE, TRUE);
    RAISE EXCEPTION 'the outcome constraint accepted an unknown value';
  EXCEPTION WHEN check_violation THEN
    NULL;  -- expected
  END;

  -- RLS is on and no policy grants anyone access.
  SELECT COUNT(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'parts_provider_reference_cache';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'reference cache has % policy(ies); it should have none', v_count;
  END IF;

  -- anon and authenticated hold nothing on it.
  SELECT COUNT(*) INTO v_count
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name = 'parts_provider_reference_cache'
     AND grantee IN ('anon', 'authenticated');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'anon/authenticated still hold % grant(s) on the reference cache', v_count;
  END IF;

  -- service_role kept its access after the REVOKE.
  SELECT COUNT(*) INTO v_count
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name = 'parts_provider_reference_cache'
     AND grantee = 'service_role';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'service_role lost access to the reference cache';
  END IF;
END $$;
