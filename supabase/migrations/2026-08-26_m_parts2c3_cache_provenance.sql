-- M-PARTS2C.3 — provenance columns required by the production cache policy.
--
-- The approval to keep a persistent AutoPartsAPI cache is conditional: every
-- row must carry the provider, a canonical cache key, when it was fetched,
-- when it expires, and the dataset it came from. The original table had the
-- key and the expiry but not the provider or the provenance.
--
-- Provenance here means: WHICH provider, from WHICH host, at WHAT TIME. That
-- is what makes a row auditable against the provider's terms — it answers
-- "where did this come from and how old is it" without holding anything
-- secret. The API key never appears; it travels in a request header and is
-- not part of a cache key or a provenance record.
--
-- Additive. No existing column is dropped and no row is discarded: existing
-- rows take the defaults, which are true of them.

ALTER TABLE public.parts_provider_reference_cache
  -- One provider today. Named anyway, so a second one cannot silently share
  -- a key space with the first.
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'autopartsapi',

  -- Distinct from created_at: a refreshed row keeps its creation time but
  -- must report when the payload currently held was actually fetched.
  ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The dataset the payload came from — host only, never a full URL with
  -- parameters and never a credential.
  ADD COLUMN IF NOT EXISTS source_host TEXT;

COMMENT ON TABLE public.parts_provider_reference_cache IS
  'Expiring cache of AutoPartsAPI reference lookups (manufacturers, model '
  'series, vehicle variants). NOT a mirror: rows expire, expired rows are '
  'deleted on encounter, and only reference categories may be stored. '
  'AutoPartsAPI remains the source of truth.';

COMMENT ON COLUMN public.parts_provider_reference_cache.fetched_at IS
  'When the payload currently held was retrieved from the provider.';
COMMENT ON COLUMN public.parts_provider_reference_cache.source_host IS
  'Provider host the payload came from. Never a full URL, never a credential.';

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Every column the policy requires must now exist. Derived from a list
  -- rather than checked one by one, so adding a requirement here fails loudly
  -- instead of being forgotten.
  SELECT COUNT(*) INTO v_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'parts_provider_reference_cache'
     AND column_name IN ('provider', 'cache_key', 'fetched_at', 'expires_at', 'source_host');
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'reference cache is missing policy-required columns (found %, expected 5)', v_count;
  END IF;

  -- Negative control: the same query must NOT find a column that was never
  -- added. A count that passes for the wrong reason is not a check.
  SELECT COUNT(*) INTO v_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'parts_provider_reference_cache'
     AND column_name = 'definitely_not_a_real_column_xyz';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'column existence check is not discriminating';
  END IF;

  -- Provenance must be non-null going forward for provider and fetched_at.
  SELECT COUNT(*) INTO v_count
    FROM public.parts_provider_reference_cache
   WHERE provider IS NULL OR fetched_at IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '% cache row(s) lack provider or fetched_at', v_count;
  END IF;
END $$;
