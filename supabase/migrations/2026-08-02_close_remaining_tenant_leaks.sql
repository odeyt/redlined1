-- ============================================================================
-- SECURITY: close the remaining cross-tenant read leaks
--
-- NOT YET APPLIED — review before running.
--
-- FINDING (verified 2026-08-02 in production): a signed-in customer belonging
-- to none of D1's shops could read, as a plain authenticated user:
--
--     estimates              19 rows
--     appointments            9
--     technicians            25
--     payments               11
--     maintenance_schedules  11
--     profiles                1
--
-- Same shape as the auth_all_* leak closed on 2026-07-31 for parts,
-- repair_orders, invoices and shop_settings — that fix only covered the four
-- tables probed at the time. These policies grant USING (true) to
-- `authenticated`, and permissive policies are OR'd, so each one defeats the
-- correctly-scoped policy sitting beside it.
--
-- NOT a simple drop: three tables need a replacement policy first, or dropping
-- the open one takes access away entirely.
--
--   estimates / maintenance_schedules / payments
--       already have *_shop_scoped (ALL, shop_id = ANY(my_shop_ids())).
--       Safe to drop the open policy outright.
--
--   technicians
--       only owner_isolation (owner_id = auth.uid()) would remain, so staff
--       records created by a colleague would vanish from the roster and could
--       not be edited. Needs a shop-scoped policy.
--
--   appointments
--       has NO shop-scoped policy at all — only two USING (true) policies.
--       Dropping both without a replacement removes all access.
--
--   profiles
--       profiles_self_read (SELECT, auth.uid() = id) remains, but no UPDATE
--       policy would be left, breaking self-service edits. Needs
--       profiles_self_update. Column privileges already restrict writes to
--       (email, shop_name) — see 2026-07-31_close_profile_self_escalation.sql —
--       so this policy only re-establishes row scoping, not column scoping.
--       Reading other users' profiles is NOT restored: the only client-side
--       reader is lib/usePlan.ts (own row), while the members list and invite
--       flow use the service role and bypass RLS.
--
-- Replacements are created BEFORE the open policies are dropped, and the whole
-- migration is one transaction, so there is no window without access.
--
-- Safe to rerun.
-- ============================================================================

BEGIN;

-- ── 1. Tables that already have a correct policy ────────────────────────────

DROP POLICY IF EXISTS auth_all_estimates             ON public.estimates;
DROP POLICY IF EXISTS auth_all_maintenance_schedules ON public.maintenance_schedules;
DROP POLICY IF EXISTS auth_all_payments              ON public.payments;

-- ── 2. technicians — add shop scoping, then remove the open policy ──────────

DROP POLICY IF EXISTS technicians_shop_scoped ON public.technicians;
CREATE POLICY technicians_shop_scoped ON public.technicians
  FOR ALL TO authenticated
  USING      (shop_id = ANY (my_shop_ids()))
  WITH CHECK (shop_id = ANY (my_shop_ids()));

DROP POLICY IF EXISTS auth_all_technicians ON public.technicians;

-- ── 3. appointments — had no scoped policy whatsoever ───────────────────────

-- appointments.shop_id is TEXT while every other tenant table uses uuid, so the
-- usual `shop_id = ANY(my_shop_ids())` fails with "operator does not exist:
-- text = uuid". The comparison casts the FUNCTION OUTPUT to text rather than
-- casting the column to uuid: a row holding a malformed value then simply fails
-- to match (access denied) instead of raising a query error for every user.
-- All 9 current rows hold valid UUIDs; the column type is the anomaly and is
-- worth normalising separately.
DROP POLICY IF EXISTS appointments_shop_scoped ON public.appointments;
CREATE POLICY appointments_shop_scoped ON public.appointments
  FOR ALL TO authenticated
  USING      (shop_id IN (SELECT my_shop_ids()::text))
  WITH CHECK (shop_id IN (SELECT my_shop_ids()::text));

DROP POLICY IF EXISTS "allow all for authenticated" ON public.appointments;
DROP POLICY IF EXISTS appointments_all              ON public.appointments;

-- ── 4. profiles — keep self-service working, stop reading other people ──────

DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE TO authenticated
  USING      (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS auth_all_profiles ON public.profiles;
DROP POLICY IF EXISTS profiles_read     ON public.profiles;

COMMIT;


-- ── Verification ────────────────────────────────────────────────────────────

-- 1. No policy on these tables may still be unconditional. Expect zero rows.
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('estimates','appointments','technicians','payments',
                    'maintenance_schedules','profiles')
  AND qual = 'true';

-- 2. Every table keeps at least one usable policy. Expect a row for each of
--    the six tables.
SELECT tablename, count(*) AS policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('estimates','appointments','technicians','payments',
                    'maintenance_schedules','profiles')
GROUP BY tablename
ORDER BY tablename;

-- 3. Data untouched — this migration changes permissions only.
SELECT 'estimates' AS t, count(*) FROM public.estimates
UNION ALL SELECT 'appointments',          count(*) FROM public.appointments
UNION ALL SELECT 'technicians',           count(*) FROM public.technicians
UNION ALL SELECT 'payments',              count(*) FROM public.payments
UNION ALL SELECT 'maintenance_schedules', count(*) FROM public.maintenance_schedules
UNION ALL SELECT 'profiles',              count(*) FROM public.profiles;
