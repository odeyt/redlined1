-- ============================================================
-- Free Forever caps: install the enforcement, and make it race-safe.
--
-- Marketing promises Free Forever: 10 customers, 10 vehicles, 5 jobs per
-- calendar month. supabase/migrations/free_tier_usage_limits.sql was meant to
-- enforce that with BEFORE INSERT triggers, but it was NOT applied to
-- production (ldjrlvjkmzrcdqhetqoh) or staging (kfwxmfvlfdurvjruadtc): on both,
-- public.enforce_free_tier_count_limit() and its triggers were found missing.
-- So today nothing enforces the caps. This migration installs the function AND
-- the three triggers, and supersedes free_tier_usage_limits.sql (do not run
-- that file afterwards: it would replace this function with a version that
-- counts then inserts, with no lock).
--
-- ## Behaviour (unchanged from the reviewed original)
--   customers  10 rows per shop
--   vehicles   10 rows per shop
--   job_cards   5 rows per shop with check_in_date in the current calendar
--               month (date_trunc('month', now()), database timezone)
--   Error on breach: 'FREE_TIER_LIMIT:<table>:<limit>' (P0001), which
--   lib/freeTierLimit.ts turns into the upgrade prompt.
--   Only shops whose OWNER has profiles.plan = 'free' are limited. Owner is
--   resolved through shop_users.role = 'owner' -> profiles. A paid plan, no
--   owner row, or an owner with no profile is NOT limited (the original
--   behaviour, kept on purpose; this is not an entitlement change). An owner
--   row with plan = 'free' and a still-running trial_ends_at IS limited, as in
--   the original, even though the app treats that transient signup row as a
--   trial.
--   Only INSERTs are checked: existing rows are never touched, so a free shop
--   already above a cap keeps its data and simply cannot add more.
--
-- ## Race safety
--   The original counted and then inserted, so concurrent inserts all passed.
--   For free shops a transaction-scoped advisory lock keyed on (table, shop)
--   is taken BEFORE counting. A second writer waits for the first to commit,
--   then counts (fresh snapshot per statement under READ COMMITTED, which
--   PostgREST uses) and sees the committed row. Paid / unresolved shops return
--   before the lock. Locks are per table and per shop, so nothing else waits.
--
-- ## Function hardening
--   SECURITY DEFINER (it must read shop_users/profiles regardless of the
--   caller's RLS), SET search_path = '' with every object schema-qualified, and
--   EXECUTE revoked from PUBLIC, anon and authenticated. Trigger firing does
--   not check EXECUTE on the trigger function, so inserts by application roles
--   keep working (the tests insert as `authenticated`).
--
-- ## Safety of installation
--   One transaction. It refuses to run, changing nothing, if:
--     * a required table/column is missing, or
--     * more than one enforce_free_tier_count_limit overload exists, or
--     * a trigger named trg_free_tier_limit on these tables is not exactly a
--       BEFORE INSERT FOR EACH ROW trigger of this function, or
--     * any other trigger on these tables already calls this function or has
--       'free_tier' in its function name.
--   Unrelated triggers are never dropped or altered; their count per table is
--   compared before and after. Re-running the identical file is a no-op
--   (triggers are created only when absent; the function is CREATE OR REPLACE).
--
-- ## Rollback (restores the state observed before this migration: no function,
-- ## no triggers). Run as one transaction:
--   BEGIN;
--   DROP TRIGGER IF EXISTS trg_free_tier_limit ON public.customers;
--   DROP TRIGGER IF EXISTS trg_free_tier_limit ON public.vehicles;
--   DROP TRIGGER IF EXISTS trg_free_tier_limit ON public.job_cards;
--   DROP FUNCTION IF EXISTS public.enforce_free_tier_count_limit();
--   COMMIT;
--   Deleting no data. If a different prior state is observed at preflight,
--   restore that definition instead (pg_get_functiondef saved beforehand).
-- ============================================================

BEGIN;

-- Snapshot of triggers that are NOT ours, to prove afterwards that none moved.
CREATE TEMP TABLE _free_tier_other_triggers ON COMMIT DROP AS
SELECT c.relname AS tbl, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS def
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('customers', 'vehicles', 'job_cards')
  AND NOT t.tgisinternal
  AND t.tgname <> 'trg_free_tier_limit';

-- ── Preflight: refuse to run rather than replace anything blindly ─────────
DO $$
DECLARE
  r        RECORD;
  v_fn_oid oid;
  v_count  integer;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('customers', 'shop_id'), ('vehicles', 'shop_id'),
      ('job_cards', 'shop_id'), ('job_cards', 'check_in_date'),
      ('shop_users', 'shop_id'), ('shop_users', 'user_id'), ('shop_users', 'role'),
      ('profiles', 'id'), ('profiles', 'plan')
    ) AS v(tbl, col)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = to_regclass('public.' || r.tbl)
        AND attname = r.col AND attnum > 0 AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION 'free-tier caps: required column public.%.% is missing', r.tbl, r.col;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_count
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace AND proname = 'enforce_free_tier_count_limit';
  IF v_count > 1 THEN
    RAISE EXCEPTION 'free-tier caps: % overloads of enforce_free_tier_count_limit exist; resolve by hand', v_count;
  END IF;
  IF v_count = 1 THEN
    SELECT oid INTO v_fn_oid FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = 'enforce_free_tier_count_limit';
    IF (SELECT pronargs FROM pg_proc WHERE oid = v_fn_oid) <> 0 THEN
      RAISE EXCEPTION 'free-tier caps: enforce_free_tier_count_limit exists with arguments; resolve by hand';
    END IF;
  END IF;

  FOR r IN
    SELECT c.relname AS tbl, t.tgname, t.tgtype, t.tgfoid, p.proname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE n.nspname = 'public'
      AND c.relname IN ('customers', 'vehicles', 'job_cards')
      AND NOT t.tgisinternal
      AND (t.tgname = 'trg_free_tier_limit'
           OR p.proname = 'enforce_free_tier_count_limit'
           OR p.proname ILIKE '%free_tier%')
  LOOP
    -- Only an existing trg_free_tier_limit that is exactly ours may remain.
    IF NOT (r.tgname = 'trg_free_tier_limit'
            AND r.proname = 'enforce_free_tier_count_limit'
            AND r.tgtype = 7) THEN
      RAISE EXCEPTION 'free-tier caps: conflicting trigger % on public.% (function %, tgtype %); not replacing it',
        r.tgname, r.tbl, r.proname, r.tgtype;
    END IF;
  END LOOP;
END $$;

-- ── The function ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_free_tier_count_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_plan_key text;
  v_count    integer;
  v_limit    integer;
BEGIN
  -- Joins through shop_users (role data verified against production) rather
  -- than trusting profiles.role: the two columns are not kept in sync.
  SELECT p.plan INTO v_plan_key
  FROM public.shop_users su
  JOIN public.profiles p ON p.id = su.user_id
  WHERE su.shop_id = NEW.shop_id AND su.role = 'owner'
  LIMIT 1;

  -- Not on the free plan (paid, or no owner profile found): never limited here.
  IF v_plan_key IS DISTINCT FROM 'free' THEN
    RETURN NEW;
  END IF;

  -- Serialise free-shop inserts per (table, shop); held until commit/rollback.
  PERFORM pg_advisory_xact_lock(hashtext('free_tier.' || TG_TABLE_NAME),
                                hashtext(NEW.shop_id::text));

  IF TG_TABLE_NAME = 'customers' THEN
    v_limit := 10;
    SELECT count(*) INTO v_count FROM public.customers WHERE shop_id = NEW.shop_id;
  ELSIF TG_TABLE_NAME = 'vehicles' THEN
    v_limit := 10;
    SELECT count(*) INTO v_count FROM public.vehicles WHERE shop_id = NEW.shop_id;
  ELSIF TG_TABLE_NAME = 'job_cards' THEN
    v_limit := 5;
    -- job_cards has no created_at column; check_in_date is the closest
    -- equivalent (see the review notes in the PR: it is caller-supplied).
    SELECT count(*) INTO v_count
    FROM public.job_cards
    WHERE shop_id = NEW.shop_id
      AND check_in_date >= date_trunc('month', now());
  ELSE
    RETURN NEW;
  END IF;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'FREE_TIER_LIMIT:%:%', TG_TABLE_NAME, v_limit
      USING ERRCODE = 'P0001',
            HINT = 'Upgrade your plan to add more.';
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.enforce_free_tier_count_limit() FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.enforce_free_tier_count_limit() FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.enforce_free_tier_count_limit() FROM authenticated;
  END IF;
END $$;

-- ── The triggers: created only where absent (preflight vetted any existing) ─
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers', 'vehicles', 'job_cards'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = ('public.' || t)::regclass
        AND tgname = 'trg_free_tier_limit' AND NOT tgisinternal
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER trg_free_tier_limit BEFORE INSERT ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION public.enforce_free_tier_count_limit()', t);
    END IF;
  END LOOP;
END $$;

-- ── Acceptance checks (read-only). Any failure aborts the whole migration ──
DO $$
DECLARE
  t         text;
  v_fn_oid  oid;
  v_def     text;
  v_n       integer;
BEGIN
  SELECT oid INTO STRICT v_fn_oid FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace AND proname = 'enforce_free_tier_count_limit';
  v_def := pg_get_functiondef(v_fn_oid);

  IF v_def NOT LIKE '%pg_advisory_xact_lock%' THEN
    RAISE EXCEPTION 'acceptance: function does not take the advisory lock';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn_oid) THEN
    RAISE EXCEPTION 'acceptance: function is not SECURITY DEFINER';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_fn_oid AND 'search_path=""' = ANY (proconfig)) THEN
    RAISE EXCEPTION 'acceptance: function search_path is not empty';
  END IF;
  IF has_function_privilege('public', v_fn_oid, 'EXECUTE')
     OR (to_regrole('anon') IS NOT NULL AND has_function_privilege('anon', v_fn_oid, 'EXECUTE'))
     OR (to_regrole('authenticated') IS NOT NULL AND has_function_privilege('authenticated', v_fn_oid, 'EXECUTE')) THEN
    RAISE EXCEPTION 'acceptance: EXECUTE is still granted to PUBLIC/anon/authenticated';
  END IF;

  FOREACH t IN ARRAY ARRAY['customers', 'vehicles', 'job_cards'] LOOP
    -- Exactly one non-internal trigger calls the function on the table, and it
    -- is enabled (origin), BEFORE, INSERT-only, FOR EACH ROW (tgtype 7).
    SELECT count(*) INTO v_n FROM pg_trigger
    WHERE tgrelid = ('public.' || t)::regclass AND NOT tgisinternal AND tgfoid = v_fn_oid;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'acceptance: % triggers call the cap function on %, expected 1', v_n, t;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = ('public.' || t)::regclass AND NOT tgisinternal AND tgfoid = v_fn_oid
        AND tgname = 'trg_free_tier_limit' AND tgenabled = 'O' AND tgtype = 7
    ) THEN
      RAISE EXCEPTION 'acceptance: trigger on % is not an enabled BEFORE INSERT row trigger named trg_free_tier_limit', t;
    END IF;
  END LOOP;

  -- Nothing unrelated was touched.
  IF EXISTS (
    SELECT 1 FROM _free_tier_other_triggers o
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_trigger x
      WHERE x.tgrelid = ('public.' || o.tbl)::regclass AND x.tgname = o.tgname
        AND x.tgenabled = o.tgenabled AND pg_get_triggerdef(x.oid) = o.def)
  ) THEN
    RAISE EXCEPTION 'acceptance: an unrelated trigger was altered or removed';
  END IF;
  SELECT count(*) INTO v_n
  FROM pg_trigger x
  WHERE x.tgrelid IN ('public.customers'::regclass, 'public.vehicles'::regclass, 'public.job_cards'::regclass)
    AND NOT x.tgisinternal AND x.tgname <> 'trg_free_tier_limit';
  IF v_n <> (SELECT count(*) FROM _free_tier_other_triggers) THEN
    RAISE EXCEPTION 'acceptance: unrelated trigger count changed';
  END IF;

  RAISE NOTICE 'free-tier caps: acceptance checks passed (function + 3 triggers)';
END $$;

COMMIT;
