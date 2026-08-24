-- M-PARTS2B — provider vehicle mappings and API usage telemetry.
--
-- Two tables, and the split between them is the point:
--
--   parts_provider_vehicle_mappings   TENANT DATA. Which provider vehicle a
--                                     shop's vehicle resolved to, and who
--                                     confirmed it.
--   parts_provider_usage_events       TENANT DATA. One row per provider call
--                                     or cache hit, for local quota accounting.
--
-- Manufacturer, model and variant reference lists are NOT stored here. They
-- are catalogue reference data with no tenant content, they are identical for
-- every shop, and the provider's terms are about retention rather than
-- sharing — so they live in the in-process cache with a long TTL and are
-- never mirrored into Postgres. See lib/parts/vehicleResolution/referenceCache.ts.
--
-- Additive only. No existing table is altered.

-- ─── Provider vehicle mappings ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.parts_provider_vehicle_mappings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                  UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  vehicle_id               UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,

  provider                 TEXT NOT NULL DEFAULT 'autopartsapi',

  -- The provider's own identifiers. Confined to this table and the adapter;
  -- nothing in the estimate, invoice or vehicle record learns them.
  provider_type_id         INTEGER,
  provider_manufacturer_id INTEGER,
  provider_model_id        INTEGER,
  provider_vehicle_id      INTEGER,

  provider_manufacturer_name TEXT,
  provider_model_name        TEXT,
  provider_modification_desc TEXT,

  resolution_status        TEXT NOT NULL
    CHECK (resolution_status IN ('resolved', 'ambiguous', 'insufficient_data', 'not_found')),

  -- Why the resolver concluded what it did. Inspectable when a technician
  -- asks why their Tacoma resolved to one modification and not another.
  resolution_evidence      JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- A mapping is valid only for the vehicle DESCRIPTION it was resolved from.
  -- Change the engine and it is a different vehicle to a parts catalogue,
  -- whatever the row id says. See vehicleResolution/fingerprint.ts.
  vehicle_fingerprint      TEXT NOT NULL,

  -- Set when a technician chose among candidates rather than the resolver
  -- deciding. A confirmed mapping is stronger evidence than a computed one.
  confirmed_by_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at             TIMESTAMPTZ,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One live mapping per (shop, vehicle, provider). A re-resolution updates in
-- place rather than accumulating rows nobody can choose between.
CREATE UNIQUE INDEX IF NOT EXISTS parts_provider_vehicle_map_unique
  ON public.parts_provider_vehicle_mappings (shop_id, vehicle_id, provider);

-- The lookup the search path actually makes.
CREATE INDEX IF NOT EXISTS parts_provider_vehicle_map_fingerprint_idx
  ON public.parts_provider_vehicle_mappings (shop_id, vehicle_id, vehicle_fingerprint);

-- ─── Usage telemetry ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.parts_provider_usage_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id          UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL DEFAULT 'autopartsapi',

  -- A CATEGORY, not a URL. A URL can carry an OEM number, and over time a
  -- table of them becomes a record of what a shop is quoting.
  endpoint_category TEXT NOT NULL
    CHECK (endpoint_category IN (
      'reference', 'manufacturers', 'models', 'vehicle_variants',
      'vehicle_detail', 'oem_search', 'oem_applicability', 'cross_reference'
    )),

  -- False for an external call, true when our cache answered. Only the former
  -- spends quota, and the distinction is the whole reason to record this.
  cache_hit        BOOLEAN NOT NULL DEFAULT FALSE,
  success          BOOLEAN NOT NULL DEFAULT TRUE,
  -- A classified failure kind, never a provider message.
  failure_kind     TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The monthly rollup this exists to answer.
CREATE INDEX IF NOT EXISTS parts_provider_usage_shop_time_idx
  ON public.parts_provider_usage_events (shop_id, created_at DESC);

-- Counting external calls only.
CREATE INDEX IF NOT EXISTS parts_provider_usage_external_idx
  ON public.parts_provider_usage_events (shop_id, created_at DESC)
  WHERE cache_hit = FALSE;

-- ─── Row level security ─────────────────────────────────────────────────────
--
-- Both tables are tenant data. A mapping created by shop A must never be
-- readable by shop B: it names a customer's vehicle.

ALTER TABLE public.parts_provider_vehicle_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parts_provider_usage_events     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parts_provider_vehicle_map_member_read ON public.parts_provider_vehicle_mappings;
CREATE POLICY parts_provider_vehicle_map_member_read
  ON public.parts_provider_vehicle_mappings FOR SELECT
  USING (shop_id IN (SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS parts_provider_usage_member_read ON public.parts_provider_usage_events;
CREATE POLICY parts_provider_usage_member_read
  ON public.parts_provider_usage_events FOR SELECT
  USING (shop_id IN (SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid()));

-- Writes happen server-side through the service role only. There is no INSERT
-- or UPDATE policy, and no grant to authenticated — a browser cannot write a
-- resolution mapping or forge a usage row to hide its own consumption.
--
-- REVOKE ... FROM PUBLIC also strips the privileges service_role inherits
-- through PUBLIC, so they are restated. Found the hard way on
-- api_rate_limit_hit, where the API layer lost EXECUTE on its own function.
REVOKE ALL ON public.parts_provider_vehicle_mappings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.parts_provider_usage_events     FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.parts_provider_vehicle_mappings TO authenticated;
GRANT SELECT ON public.parts_provider_usage_events     TO authenticated;

GRANT ALL ON public.parts_provider_vehicle_mappings TO service_role;
GRANT ALL ON public.parts_provider_usage_events     TO service_role;

-- ─── Verification ───────────────────────────────────────────────────────────
--
-- Asserted rather than assumed. A migration that silently did nothing is
-- indistinguishable from one that worked until something reads the table.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'parts_provider_vehicle_mappings'
  ) THEN
    RAISE EXCEPTION 'parts_provider_vehicle_mappings was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'parts_provider_usage_events'
  ) THEN
    RAISE EXCEPTION 'parts_provider_usage_events was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'parts_provider_vehicle_map_unique'
  ) THEN
    RAISE EXCEPTION 'parts_provider_vehicle_map_unique was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'parts_provider_vehicle_mappings'
      AND policyname = 'parts_provider_vehicle_map_member_read'
  ) THEN
    RAISE EXCEPTION 'shop-scoped read policy missing on parts_provider_vehicle_mappings';
  END IF;

  -- The browser must not be able to write either table.
  IF has_table_privilege('authenticated', 'public.parts_provider_vehicle_mappings', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated must not hold INSERT on parts_provider_vehicle_mappings';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.parts_provider_usage_events', 'INSERT') THEN
    RAISE EXCEPTION 'service_role lost INSERT on parts_provider_usage_events';
  END IF;
END $$;
