-- Synthetic (demo) shops: a platform-managed flag, and growth reporting that ignores them.
--
-- WHY
--
-- A dedicated demo tenant is being created for a marketing walkthrough. Without
-- this, Sapelee's growth reporting would count it as a real signup, a FREE shop,
-- and once the walkthrough runs an activated one. That is a fake customer in the
-- numbers used to judge whether the product is working.
--
-- WHY A COLUMN, NOT THE EXISTING INTERNAL LIST
--
-- Internal shops are recognised by UUIDs hand-copied into lib/usePlan.ts,
-- lib/adminAuth.ts and growth_subscription_summary_v1. Adding the demo shop there
-- would (a) commit its production ID, which the owner has ruled out, and (b) grant
-- it paid status through usePlan.ts, which it must not have: it runs on Free
-- Forever so the walkthrough shows the real plan. `shops` has no metadata column
-- to reuse (verified against production: id, name, slug, created_at,
-- organization_id, archived_at, archived_reason), and archived_at already means
-- something else to the shop switcher.
--
-- WHAT CHANGES
--
--   1. shops.is_synthetic boolean NOT NULL DEFAULT false. Every existing shop
--      becomes false, which is what it already was.
--   2. A trigger refusing any change to it from a tenant role. A column GRANT
--      cannot do this: Supabase grants table-level privileges to `authenticated`,
--      and a table-level grant overrides a column-level revoke.
--   3. growth_shop_activation_v1 and growth_subscription_summary_v1 skip synthetic
--      shops. growth_funnel_summary_v1 is NOT touched: it joins those two, so it
--      inherits the exclusion. No new classification value is introduced, so
--      nothing that enumerates INTERNAL|PAID|TRIAL|FREE|UNKNOWN must learn one.
--
-- Both functions use CREATE OR REPLACE with byte-identical signatures, so the
-- EXECUTE grants tightened in 20260908000003 are preserved, and Postgres itself
-- refuses the replacement if a return type differs.
--
-- RUN AS FOUR SEPARATE EXECUTIONS. The verification probe runs in its own
-- transaction after the change is committed, so a failing probe can never roll
-- back the change it checks (the lesson of M-ACTIVATION1's first attempt).
-- ============================================================================


-- ===========================================================================
-- STEP 1: preflight. Read-only. Run alone and check every row.
-- ===========================================================================
--
-- live_value must equal expected for both functions. The expected values are
-- the function bodies in 20260908000002 and 20260908000003, committed in
-- 4258f92 after read-only reconciliation against production. A mismatch means
-- production was changed after that reconciliation: STOP, do not run step 2.

SELECT p.proname::text AS check_name,
       md5(btrim(replace(p.prosrc, E'\r', ''), E' \n\t')) AS live_value,
       CASE p.proname
         WHEN 'growth_subscription_summary_v1' THEN 'e5d1716fae635eb98df3e34b5bbfdb40'
         WHEN 'growth_shop_activation_v1'      THEN 'cb25d39008ec9503bdfac1cfe202ce8c'
       END AS expected
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('growth_subscription_summary_v1', 'growth_shop_activation_v1')
UNION ALL
SELECT 'shops.is_synthetic column exists',
       (EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'shops'
                  AND column_name = 'is_synthetic'))::text,
       'false';


-- ===========================================================================
-- STEP 2: the change. One transaction; refuses to start on a fingerprint mismatch.
-- ===========================================================================

BEGIN;

DO $guard$
DECLARE
  v_sub text;
  v_act text;
BEGIN
  SELECT md5(btrim(replace(prosrc, E'\r', ''), E' \n\t')) INTO v_sub
  FROM pg_proc WHERE oid = 'public.growth_subscription_summary_v1()'::regprocedure;
  SELECT md5(btrim(replace(prosrc, E'\r', ''), E' \n\t')) INTO v_act
  FROM pg_proc WHERE oid = 'public.growth_shop_activation_v1()'::regprocedure;

  IF v_sub IS DISTINCT FROM 'e5d1716fae635eb98df3e34b5bbfdb40' THEN
    RAISE EXCEPTION 'growth_subscription_summary_v1 differs from the reviewed version (md5 %). Nothing was changed.', v_sub;
  END IF;
  IF v_act IS DISTINCT FROM 'cb25d39008ec9503bdfac1cfe202ce8c' THEN
    RAISE EXCEPTION 'growth_shop_activation_v1 differs from the reviewed version (md5 %). Nothing was changed.', v_act;
  END IF;
END
$guard$;

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.shops.is_synthetic IS
  'Platform-managed. True only for demo/marketing tenants. Excluded from growth reporting. Tenants cannot set or change it (trigger shops_guard_is_synthetic).';

-- Not SECURITY DEFINER on purpose: current_user must be the role that issued the
-- statement. PostgREST switches to anon / authenticated / service_role; the SQL
-- Editor runs as postgres.
CREATE OR REPLACE FUNCTION public.shops_guard_is_synthetic()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.is_synthetic THEN
    RAISE EXCEPTION 'shops.is_synthetic is platform-managed' USING ERRCODE = '42501';
  END IF;

  -- Both directions. Clearing it would put a demo shop into the growth figures;
  -- setting it would take a real shop out of them.
  IF TG_OP = 'UPDATE' AND NEW.is_synthetic IS DISTINCT FROM OLD.is_synthetic THEN
    RAISE EXCEPTION 'shops.is_synthetic is platform-managed' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS shops_guard_is_synthetic ON public.shops;
CREATE TRIGGER shops_guard_is_synthetic
  BEFORE INSERT OR UPDATE ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.shops_guard_is_synthetic();

-- Body copied verbatim from 20260908000002 with ONE added line:
--   where not s.is_synthetic
create or replace function growth_subscription_summary_v1()
returns table (
  shop_id text,
  classification text,       -- INTERNAL | PAID | TRIAL | FREE | UNKNOWN
  effective_plan text,       -- best-known paid plan value, or null
  trial_ends_at timestamptz, -- best-known active trial end, or null
  owner_count bigint,
  owners_with_profile bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with owner_profiles as (
    select
      su.shop_id::text as shop_id,
      su.user_id::text as user_id,
      (p.id is not null) as has_profile,
      p.plan,
      p.trial_ends_at,
      -- Mirrors lib/planGate.ts's getPlanStatus() exactly.
      case
        when p.plan is not null
          and p.plan in ('pro','solo','starter','professional','business','enterprise')
          then 'PAID'
        when p.trial_ends_at is not null and p.trial_ends_at > now() then 'TRIAL'
        when p.id is not null then 'FREE'
        else null -- owner row exists, but no matching profiles row at all
      end as owner_status
    from shop_users su
    left join profiles p on p.id::text = su.user_id::text
    where su.role = 'owner'
  ),
  shop_rollup as (
    select
      s.id::text as shop_id,
      count(op.user_id) as owner_count,
      count(op.user_id) filter (where op.has_profile) as owners_with_profile,
      bool_or(op.owner_status = 'PAID') as any_paid,
      bool_or(op.owner_status = 'TRIAL') as any_trial,
      bool_or(op.owner_status = 'FREE') as any_free,
      max(op.plan) filter (where op.owner_status = 'PAID') as paid_plan,
      max(op.trial_ends_at) filter (where op.owner_status = 'TRIAL') as trial_end
    from shops s
    left join owner_profiles op on op.shop_id = s.id::text
    where not s.is_synthetic
    group by s.id
  )
  select
    shop_id,
    case
      -- Verbatim from lib/usePlan.ts's INTERNAL_SHOP_IDS. Keep in sync by hand.
      when shop_id in ('38d55fae-741b-4bac-b520-f96eed65bf38', '90b72748-bf01-4456-999f-f4ba48091606')
        then 'INTERNAL'
      when any_paid then 'PAID'
      when any_trial then 'TRIAL'
      when any_free then 'FREE'
      else 'UNKNOWN'
    end as classification,
    paid_plan as effective_plan,
    trial_end as trial_ends_at,
    coalesce(owner_count, 0) as owner_count,
    coalesce(owners_with_profile, 0) as owners_with_profile
  from shop_rollup;
$$;

-- Body copied verbatim from 20260908000003 with ONE added line:
--   where not s.is_synthetic
create or replace function growth_shop_activation_v1()
returns table (
  shop_id text,
  shop_created_at timestamptz,
  first_job_created_at timestamptz,
  first_appointment_at timestamptz,
  first_job_completed_at timestamptz,
  last_activity_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    s.id::text as shop_id,
    s.created_at as shop_created_at,
    least(
      min(jc.created_at),
      min(jc.check_in_date),
      min(cj.created_at)  -- preserves the ORIGINAL job creation time even once closed/archived
    ) as first_job_created_at,
    min(a.created_at) as first_appointment_at,
    min(cj.closed_date) as first_job_completed_at,
    greatest(
      coalesce(max(jc.created_at), 'epoch'::timestamptz),
      coalesce(max(a.created_at), 'epoch'::timestamptz),
      coalesce(max(cj.closed_date), 'epoch'::timestamptz)
    ) as last_activity_at
  from shops s
  left join job_cards jc on jc.shop_id::text = s.id::text
  left join appointments a on a.shop_id::text = s.id::text
  left join closed_jobs cj on cj.shop_id::text = s.id::text
  where not s.is_synthetic
  group by s.id, s.created_at;
$$;

COMMIT;


-- ===========================================================================
-- STEP 3: prove it. Separate execution. Two probe shops, checks, ROLLBACK.
-- ===========================================================================
--
-- Inserting a shop fires shops_create_settings (a blank settings row). The
-- ROLLBACK removes both. No HTTP is involved: only alert_events has an outbound
-- trigger, and nothing here writes one.

BEGIN;

DO $probe$
DECLARE
  real_probe uuid;
  demo_probe uuid;
  n int;
BEGIN
  INSERT INTO public.shops (name, slug, is_synthetic)
  VALUES ('__probe_real__', '__probe-real-' || gen_random_uuid() || '__', false)
  RETURNING id INTO real_probe;

  INSERT INTO public.shops (name, slug, is_synthetic)
  VALUES ('__probe_synthetic__', '__probe-synthetic-' || gen_random_uuid() || '__', true)
  RETURNING id INTO demo_probe;

  SELECT count(*) INTO n FROM public.growth_subscription_summary_v1() WHERE shop_id = real_probe::text;
  IF n <> 1 THEN RAISE EXCEPTION 'subscription summary lost a REAL shop (found %)', n; END IF;

  SELECT count(*) INTO n FROM public.growth_subscription_summary_v1() WHERE shop_id = demo_probe::text;
  IF n <> 0 THEN RAISE EXCEPTION 'subscription summary still reports a SYNTHETIC shop (found %)', n; END IF;

  SELECT count(*) INTO n FROM public.growth_shop_activation_v1() WHERE shop_id = real_probe::text;
  IF n <> 1 THEN RAISE EXCEPTION 'activation lost a REAL shop (found %)', n; END IF;

  SELECT count(*) INTO n FROM public.growth_shop_activation_v1() WHERE shop_id = demo_probe::text;
  IF n <> 0 THEN RAISE EXCEPTION 'activation still reports a SYNTHETIC shop (found %)', n; END IF;

  RAISE NOTICE 'is_synthetic probe passed: real shop reported, synthetic shop excluded';
END
$probe$;

ROLLBACK;


-- ===========================================================================
-- STEP 4: verification. Read-only.
-- ===========================================================================

SELECT
  (SELECT count(*) FROM public.shops)                             AS shops_total,
  (SELECT count(*) FROM public.shops WHERE is_synthetic)          AS synthetic_expect_0,
  (SELECT count(*) FROM public.growth_subscription_summary_v1())  AS in_subscription_summary,
  (SELECT count(*) FROM public.growth_shop_activation_v1())       AS in_activation,
  (SELECT count(*) FROM pg_trigger
     WHERE tgrelid = 'public.shops'::regclass
       AND tgname = 'shops_guard_is_synthetic')                   AS guard_trigger_expect_1,
  (SELECT count(*) FROM public.shops
     WHERE name LIKE '\_\_probe\_%')                               AS probe_leftover_expect_0;
-- Before any demo tenant exists: shops_total = in_subscription_summary = in_activation.

-- EXECUTE grants, unchanged by CREATE OR REPLACE:
SELECT p.proname, pg_catalog.array_to_string(p.proacl, ', ') AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'growth\_%\_v1';


-- Rollback
--   Restore both functions from 20260908000002 / 20260908000003 (CREATE OR
--   REPLACE with their original bodies), then:
--
--   DROP TRIGGER IF EXISTS shops_guard_is_synthetic ON public.shops;
--   DROP FUNCTION IF EXISTS public.shops_guard_is_synthetic();
--   ALTER TABLE public.shops DROP COLUMN IF EXISTS is_synthetic;
--
--   Check first. Dropping the column returns every demo tenant to growth reporting:
--   SELECT count(*) FROM public.shops WHERE is_synthetic;


-- ===========================================================================
-- STEP 3b (optional operator probe, owner-approved 2026-09-15): guard roles.
-- Separate execution, after STEP 3 and its post-rollback check. Ends in ROLLBACK.
-- ===========================================================================
--
-- Appended after the rollback notes on purpose: STEPS 1-4 above keep their line
-- numbers and their reviewed SHA-256 hashes (asserted in
-- lib/marketing-capture/__tests__/captureIsolation.test.ts).
--
-- WHY. STEP 3 proves the growth functions exclude a synthetic shop, and that the
-- migration owner (postgres) may set the flag. It never exercises another role.
-- This does, inside one transaction that is rolled back:
--   1-2. service_role (the seed's path) may insert a synthetic shop and change
--        its flag: the UPDATE must affect exactly one row and read back false.
--   3-4. authenticated and anon may not insert a synthetic shop, and the refusal
--        must carry the guard's own message. A refusal for any other reason (a
--        missing privilege, an RLS check) stops the probe rather than passing it.
-- An ordinary role CHANGING the flag cannot be exercised: shops exposes no row
-- for an ordinary role to update (it has only a SELECT policy), so RLS refuses
-- first. The guard's UPDATE branch is covered by its reviewed body.
--
-- PREREQUISITES (read-only pre-check, rows 30-32). postgres may SET ROLE to
-- authenticated, anon and service_role; service_role has BYPASSRLS and
-- authenticated and anon do not; authenticated and anon hold INSERT on shops;
-- service_role holds INSERT and UPDATE. If any of these differ, do not run it.
--
-- WRITES, all rolled back: one '__probe_service__' shop, plus the blank
-- shop_settings row that shops_create_settings adds for it. The two refused
-- inserts write nothing. NOT undone by the rollback: shop_settings_id_seq
-- advances by 1 (nextval is not transactional; a harmless id gap). It creates no
-- auth user, profile, membership, alert, notification, HTTP request, invoice,
-- payment or Sapelee event: the only triggers it reaches are
-- shops_guard_is_synthetic and shops_create_settings.
--
-- EXPECTED: no error ("Success. No rows returned"; the NOTICE may not show).
--
-- STOP on any error, notably:
--   GUARD FAILURE: ... inserted a synthetic shop    critical: a tenant role set the flag
--   ... was refused, but not by the guard: ...       not proven: check privileges and RLS
--   service_role flag change affected N rows / did not apply
--   role was not restored after the refused insert
--
-- RECOVERY after any error: run ROLLBACK on its own (harmless if no transaction is
-- open), then the POST-ROLLBACK CHECK below, and report both results. The block
-- contains no commit statement, so an error can never leave a probe row behind.

BEGIN;

DO $probe_roles$
DECLARE
  svc_probe uuid;
  rc int;
  flag boolean;
  msg text;
BEGIN
  -- 1. The seed's path: service_role may insert a synthetic shop.
  SET LOCAL ROLE service_role;
  INSERT INTO public.shops (name, slug, is_synthetic)
  VALUES ('__probe_service__', '__probe-service-' || gen_random_uuid() || '__', true)
  RETURNING id INTO svc_probe;

  -- 2. service_role may change the flag.
  UPDATE public.shops SET is_synthetic = false WHERE id = svc_probe;
  GET DIAGNOSTICS rc = ROW_COUNT;
  RESET ROLE;
  IF rc <> 1 THEN RAISE EXCEPTION 'service_role flag change affected % rows, expected 1', rc; END IF;
  SELECT is_synthetic INTO flag FROM public.shops WHERE id = svc_probe;
  IF flag IS DISTINCT FROM false THEN RAISE EXCEPTION 'service_role flag change did not apply'; END IF;

  -- 3. authenticated may not insert a synthetic shop, and it is the guard that refuses.
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.shops (name, slug, is_synthetic)
    VALUES ('__probe_authenticated__', '__probe-authenticated-' || gen_random_uuid() || '__', true);
    RAISE EXCEPTION 'GUARD FAILURE: authenticated inserted a synthetic shop';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
    IF msg <> 'shops.is_synthetic is platform-managed' THEN
      RAISE EXCEPTION 'authenticated was refused, but not by the guard: %', msg;
    END IF;
  END;
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'role was not restored after the refused insert (%)', current_user; END IF;

  -- 4. anon likewise.
  BEGIN
    SET LOCAL ROLE anon;
    INSERT INTO public.shops (name, slug, is_synthetic)
    VALUES ('__probe_anon__', '__probe-anon-' || gen_random_uuid() || '__', true);
    RAISE EXCEPTION 'GUARD FAILURE: anon inserted a synthetic shop';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
    IF msg <> 'shops.is_synthetic is platform-managed' THEN
      RAISE EXCEPTION 'anon was refused, but not by the guard: %', msg;
    END IF;
  END;
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'role was not restored after the refused insert (%)', current_user; END IF;

  RAISE NOTICE 'guard role probe passed: service_role may set and change is_synthetic; authenticated and anon are refused by the guard';
END
$probe_roles$;

ROLLBACK;


-- ===========================================================================
-- POST-ROLLBACK CHECK (read-only). Run after STEP 3, and again after STEP 3b.
-- ===========================================================================
--
-- The literal 14 is the production shop count on 2026-09-15, before any demo
-- tenant existed. Update both occurrences if the baseline has changed.
--
-- Expect rows 1-6 PASS: 0 probe shops, 0 synthetic shops, 14 shops, 0 orphaned
-- shop_settings rows, growth counts 14 / 14 / 14, guard trigger present.
-- Rows 7-8 COMPARE with the pre-check: shop_settings rows EQUAL the baseline;
-- shop_settings_id_seq last_value = baseline + 2 after STEP 3, + 1 more after
-- STEP 3b. Any other value is a STOP: report the output and run nothing further.

BEGIN TRANSACTION READ ONLY;

WITH
checks (ord, check_name, expected, actual) AS (
  SELECT 1, 'probe shops remaining', '0', (SELECT count(*)::text FROM public.shops WHERE name LIKE '\_\_probe\_%')
  UNION ALL
  SELECT 2, 'synthetic shops', '0', (SELECT count(*)::text FROM public.shops WHERE is_synthetic)
  UNION ALL
  SELECT 3, 'shops total', '14', (SELECT count(*)::text FROM public.shops)
  UNION ALL
  SELECT 4, 'shop_settings rows without a shop', '0',
         (SELECT count(*)::text FROM public.shop_settings ss
           WHERE NOT EXISTS (SELECT 1 FROM public.shops s WHERE s.id::text = ss.shop_id::text))
  UNION ALL
  SELECT 5, 'growth counts equal shops total', '14 / 14 / 14',
         (SELECT count(*) FROM public.growth_subscription_summary_v1())::text || ' / '
           || (SELECT count(*) FROM public.growth_shop_activation_v1())::text || ' / '
           || (SELECT count(*) FROM public.shops)::text
  UNION ALL
  SELECT 6, 'guard trigger still present', '1',
         (SELECT count(*)::text FROM pg_trigger WHERE tgrelid = 'public.shops'::regclass AND tgname = 'shops_guard_is_synthetic')
  UNION ALL
  SELECT 7, 'shop_settings rows (compare with pre-check baseline)', '(equal to baseline)',
         (SELECT count(*)::text FROM public.shop_settings)
  UNION ALL
  SELECT 8, 'shop_settings_id_seq last_value (baseline + 2 after Step 3; + 1 more after Step 3b)', '(baseline + expected increments)',
         (SELECT coalesce(last_value::text, '(never called)') FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'shop_settings_id_seq')
)
SELECT check_name, expected, actual,
       CASE WHEN ord IN (7, 8) THEN 'COMPARE'
            WHEN actual IS NULL THEN 'STOP (not found)'
            WHEN actual = expected THEN 'PASS' ELSE 'STOP' END AS result
FROM checks
ORDER BY ord;

ROLLBACK;
