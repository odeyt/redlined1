-- M-PARTS2C.4 — the three fitment fields the catalogue actually supplies.
--
-- Audited first, as the milestone requires. `vehicles` holds 31 columns and
-- among the fitment-relevant ones it has year, make, model, trim, engine,
-- transmission and fuel_type. It does NOT have engine_code, displacement or
-- cylinders, and it has no drivetrain column at all.
--
-- That matters because of what the provider gives us. A cached variant row
-- carries engineCodes ("M 272.974"), capacityLt ("3.5000"), capacityTech
-- ("3498.0000") and numberOfCylinders (6) — and notably NO transmission. So
-- without these three columns, catalogue enrichment could offer almost
-- nothing: fuel_type would be the only clean mapping, and `engine` is
-- free-text already holding values like "5.5L 8-cyl".
--
-- Additive. Nullable. No existing row changes and no existing column moves.
--
-- ## Part of the vehicle fingerprint
--
-- FINGERPRINT_FIELDS goes from eight to eleven. These are fitment-significant,
-- so stale-mapping detection has to see them: with them outside, someone
-- could later type an engine code no variant supports and the mapping would
-- still read as valid, which could still produce VERIFIED FIT.
--
-- The loop that threatens — accepting a value offered BY a confirmed variant
-- instantly invalidating that mapping — is resolved by provenance instead. A
-- value proven to have come from the mapped variant rebinds the mapping with
-- no provider call; anything else invalidates it. See
-- lib/vehicles/enrichment.ts decideFingerprint().

ALTER TABLE public.vehicles
  -- The manufacturer's engine code, e.g. "M 272.974". Distinct from `engine`,
  -- which is free text a service advisor typed ("5.5L 8-cyl", "F33A-FTV").
  ADD COLUMN IF NOT EXISTS engine_code TEXT,

  -- Litres. The provider publishes this directly as capacityLt, so it is not
  -- derived from cubic centimetres and cannot be misread as cc.
  ADD COLUMN IF NOT EXISTS displacement_l NUMERIC(4,2),

  ADD COLUMN IF NOT EXISTS cylinders SMALLINT;

COMMENT ON COLUMN public.vehicles.engine_code IS
  'Manufacturer engine code (e.g. M 272.974). Not part of the parts fingerprint.';
COMMENT ON COLUMN public.vehicles.displacement_l IS
  'Engine displacement in LITRES. Not part of the parts fingerprint.';
COMMENT ON COLUMN public.vehicles.cylinders IS
  'Cylinder count. Not part of the parts fingerprint.';

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'vehicles'
     AND column_name IN ('engine_code', 'displacement_l', 'cylinders');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'vehicles is missing fitment columns (found %, expected 3)', v_count;
  END IF;

  -- Negative control: the same query must not find a column never added. A
  -- count that passes for the wrong reason is not a check.
  SELECT COUNT(*) INTO v_count
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'vehicles'
     AND column_name = 'definitely_not_a_real_column_xyz';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'column existence check is not discriminating';
  END IF;

  /*
   * "Every one of these is still NULL" is NOT asserted here.
   *
   * It is true immediately after the first run and false the moment a
   * technician accepts their first enrichment — so as a migration invariant
   * it would turn a correct re-run into a failure. A migration has to be
   * idempotent; a one-time observation about the state of the data is a
   * different thing and belongs outside it.
   *
   * The one-time verifier is in the milestone notes and was run once, before
   * any enrichment:
   *
   *   SELECT COUNT(*) FROM public.vehicles
   *    WHERE engine_code IS NOT NULL
   *       OR displacement_l IS NOT NULL
   *       OR cylinders IS NOT NULL;   -- expected 0 on first application
   */
END $$;
