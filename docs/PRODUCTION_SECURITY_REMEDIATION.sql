-- ============================================================================
-- Redlined1 — PRODUCTION SECURITY REMEDIATION
-- Run in: Supabase Dashboard → SQL Editor (against the redlined1-prod project)
-- Author: drafted by Claude Code, 2026-07-18, NOT yet executed against
--         production. Run manually after you've reviewed it.
--
-- What this fixes (see docs/LIVE_PRODUCTION_SECURITY_VERIFICATION.md):
--   1. public.shops and public.shop_users have RLS disabled in production
--      and are readable by the anon key with no login — CONFIRMED LIVE.
--   2. public.my_shop_ids() (the SECURITY DEFINER helper every other
--      shop-scoped RLS policy in this schema depends on) has no explicit
--      search_path pinned.
--   3. public.my_shop_ids() is EXECUTE-able by PUBLIC (i.e. anon too, not
--      just authenticated) — tightened to authenticated + service_role only.
--
-- Why this is safe to run as-is:
--   The policies below (`shops_member_view`, `shop_users_own`) are not new
--   design — they already exist, verbatim, in THREE separate migration
--   files already committed to this repo (migration_multitenant.sql,
--   migration_multitenant_v2.sql, migration_multitenant_fix.sql) but were
--   apparently never actually executed against production, or were later
--   reverted. This script consolidates them into one idempotent statement
--   so there's a single source of truth for what should be live.
--
-- Investigated before writing this (per your request):
--   - public.my_shop_ids(): SELECT ARRAY(SELECT shop_id FROM shop_users
--     WHERE user_id = auth.uid()) — identical across all three source
--     migration files. Fully schema-qualifies every reference, so pinning
--     search_path = '' below is safe (no unqualified lookups to break).
--   - grant-permissions.sql grants `select on shop_users to anon,
--     authenticated` and `select on shops to anon, authenticated`, and
--     NO insert/update/delete on either table to anon — confirms the read
--     exposure is the entire live blast radius for these two tables (all
--     writes already funnel through service-role-gated API routes).
--   - Whether owners/admins need to list OTHER members of their shop (not
--     just their own row): yes, the member-management screen does. But as
--     of this change, app/api/members GET performs its own explicit
--     requireShopRole() authorization check and then reads via the
--     service-role client (which bypasses RLS entirely) — see
--     lib/serverAuth.ts and app/api/members/route.ts. So the RLS policy
--     below does NOT need to expose other members' rows; it only needs to
--     support each user reading their OWN membership row(s), which is
--     exactly what lib/useShop.ts's client-side shop-context resolution
--     already does (`.eq('user_id', user.id)`), confirmed by reading that
--     file. Grep of every `.from('shop_users')` call in the repo confirms
--     no other client-side (non-service-role) code path needs to see
--     another user's row directly.
--   - FORCE ROW LEVEL SECURITY: only affects the table OWNER role bypassing
--     RLS; this app's Postgres roles are `anon`/`authenticated` (RLS never
--     bypassed) and `service_role` (has BYPASSRLS, unaffected by FORCE RLS
--     either way). Included below anyway as harmless defense-in-depth —
--     it has no functional effect on this app's actual traffic.
--
-- Everything in this script is additive/restrictive-only: it enables RLS
-- where none existed and adds policies where none existed. It cannot make
-- any currently-working, correctly-scoped access path stop working, because
-- nothing was scoped on these two tables before. Wrapped in a transaction —
-- if any statement fails, nothing here is applied.
-- ============================================================================

-- ============================================================================
-- STEP 0 (run first, read-only) — catalog inspection requested before this
-- script touches FORCE ROW LEVEL SECURITY or my_shop_ids()'s execute grants.
-- Paste these results back if you want a second opinion before proceeding.
--
-- Why I believe FORCE ROW LEVEL SECURITY is safe here regardless of what
-- these queries show: my_shop_ids()'s own query is
--   SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid()
-- which is IDENTICAL to the shop_users_own RLS policy's USING clause
-- (`user_id = auth.uid()`). auth.uid() reads the calling user's JWT claim
-- regardless of SECURITY DEFINER privilege escalation — it does not change
-- based on who owns the function. So even if FORCE RLS caused the policy to
-- apply inside the function body too, the policy would filter to exactly
-- the same rows the function's own WHERE clause already selects. There is
-- no configuration of function-owner/table-owner/BYPASSRLS where these two
-- identical predicates could disagree. Run the queries below to confirm the
-- actual values, not just take this reasoning on faith.
-- ============================================================================

-- Function owner, security-definer status, and current search_path setting.
SELECT
  p.proname AS function_name,
  pg_get_userbyid(p.proowner) AS function_owner,
  p.prosecdef AS is_security_definer,
  coalesce(
    (SELECT array_agg(cfg) FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path=%'),
    ARRAY['<none>']
  ) AS search_path_setting
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'my_shop_ids';

-- Table owner of shop_users (the table my_shop_ids() reads).
SELECT c.relname AS table_name, pg_get_userbyid(c.relowner) AS table_owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'shop_users';

-- Does the function owner role have BYPASSRLS?
SELECT r.rolname, r.rolbypassrls
FROM pg_roles r
WHERE r.rolname = (
  SELECT pg_get_userbyid(p.proowner)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'my_shop_ids'
);

-- Current EXECUTE grants on my_shop_ids() — expect PUBLIC to appear here
-- today (that's what STEP 1 below revokes).
SELECT routine_schema, routine_name, grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public' AND routine_name = 'my_shop_ids';

-- ============================================================================
-- ⚠ CRITICAL WARNING before STEP 1 runs the REVOKE below:
-- my_shop_ids() is evaluated AS the querying role (`authenticated`) every
-- time ANY shop-scoped RLS policy runs — it is referenced in the policies
-- for customers, vehicles, job_cards, repair_orders, invoices, payments,
-- estimates, inspections, parts, maintenance_schedules, shop_settings, and
-- now shops/shop_users too (confirmed by grepping every CREATE POLICY in
-- supabase/migration_multitenant*.sql). If `authenticated` loses EXECUTE on
-- this function, EVERY one of those tables' RLS policies fails to evaluate
-- and the entire live application loses read/write access — this is why
-- the REVOKE and the GRANT below are in the SAME transaction, and why the
-- REVOKE target is `PUBLIC` (the implicit "everyone" grant), never
-- `authenticated` itself.
-- ============================================================================

BEGIN;

-- ── 1. Harden the shared RLS helper function ────────────────────────────
-- Recreated with the exact same body as the existing migration files
-- (migration_multitenant.sql / _v2.sql / _fix.sql all agree), only adding
-- an explicit search_path pin. CREATE OR REPLACE is idempotent.
CREATE OR REPLACE FUNCTION public.my_shop_ids()
RETURNS UUID[] LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT ARRAY(SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid())
$$;

ALTER FUNCTION public.my_shop_ids() SET search_path = '';

-- Least-privilege execute grants: remove the implicit "everyone" (PUBLIC)
-- grant, then explicitly re-grant only to the roles that actually need to
-- invoke it — `authenticated`, whose RLS policies call it on every
-- shop-scoped query (see the CRITICAL WARNING above — do not skip the
-- GRANT), and `service_role` as a harmless defensive backstop even though
-- service_role bypasses RLS and a repo-wide grep found no direct `.rpc()`
-- call to this function today.
REVOKE EXECUTE ON FUNCTION public.my_shop_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_shop_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_shop_ids() TO service_role;

-- ── 2. shops — enable RLS, scope reads to shops the caller belongs to ──
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shops FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shops_member_view" ON public.shops;
CREATE POLICY "shops_member_view" ON public.shops
  FOR SELECT
  TO authenticated
  USING (id = ANY (public.my_shop_ids()));

-- Anon never needs to read shops directly (public job-status lookups go
-- through the service-role-backed /api/job-status route, not direct table
-- access) — revoke the blanket anon grant from grant-permissions.sql.
-- authenticated keeps its existing grant; the policy above now gates it.
REVOKE SELECT ON public.shops FROM anon;

-- ── 3. shop_users — enable RLS, scope reads to the caller's own row(s) ──
ALTER TABLE public.shop_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_users FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_users_own" ON public.shop_users;
CREATE POLICY "shop_users_own" ON public.shop_users
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

REVOKE SELECT ON public.shop_users FROM anon;

COMMIT;

-- ============================================================================
-- Post-apply verification (read-only, safe to run immediately after commit).
-- Full anon-key regression probes to run from your own machine/Postman are
-- in docs/PRODUCTION_SECURITY_VERIFICATION.md — the queries below just
-- confirm the catalog state changed as expected.
-- ============================================================================

-- Expect rls_enabled = true, rls_forced = true for both rows.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('shops', 'shop_users');

-- Expect exactly one policy per table, scoped as above.
SELECT tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('shops', 'shop_users');

-- Expect no 'anon' row for either table now.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name IN ('shops', 'shop_users')
ORDER BY table_name, grantee;

-- Expect search_path_setting to show 'search_path=' (pinned), not the
-- "<no explicit search_path set>" placeholder.
SELECT p.proname AS function_name,
  coalesce((SELECT array_agg(cfg) FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path=%'),
           ARRAY['<no explicit search_path set>']) AS search_path_setting
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'my_shop_ids';

-- Expect exactly: authenticated=EXECUTE, service_role=EXECUTE. PUBLIC/anon
-- must NOT appear. If `authenticated` is missing, STOP and run the
-- rollback's GRANT immediately — every shop-scoped table's RLS is broken
-- for every logged-in user until it's restored.
SELECT routine_schema, routine_name, grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public' AND routine_name = 'my_shop_ids';

-- Live functional check (not just catalog state) — run this logged in as a
-- real staff account, immediately after applying: confirm the dashboard
-- still loads customers/vehicles/job cards for that user's own shop. This
-- exercises my_shop_ids() through real RLS evaluation, not just the grant
-- catalog.

-- ============================================================================
-- Rollback (only if this breaks something unexpected — see
-- docs/PRODUCTION_SECURITY_VERIFICATION.md for the rollback procedure and
-- the exact regression tests to run before AND after either direction).
-- ============================================================================
-- BEGIN;
-- ALTER TABLE public.shops NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.shops DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "shops_member_view" ON public.shops;
-- GRANT SELECT ON public.shops TO anon;
--
-- ALTER TABLE public.shop_users NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.shop_users DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "shop_users_own" ON public.shop_users;
-- GRANT SELECT ON public.shop_users TO anon;
--
-- -- Only needed if something narrower than `authenticated` turns out to
-- -- need EXECUTE on my_shop_ids() that this script didn't account for.
-- -- If in doubt, this single GRANT alone (without the REVOKE) is enough to
-- -- undo any breakage — it restores the pre-script "everyone can execute"
-- -- state without needing to touch the REVOKE line above.
-- GRANT EXECUTE ON FUNCTION public.my_shop_ids() TO PUBLIC;
-- COMMIT;
-- ============================================================================

-- ============================================================================
-- ADDITIONAL DB INTEGRITY HARDENING — SEPARATE FROM THE RLS FIX ABOVE.
-- NOT included in the BEGIN/COMMIT transaction above, NOT auto-applied by
-- this script, and NOT required for the RLS fix to be correct. Found while
-- auditing app/api/invite and app/api/members: the app-layer (zod) already
-- validates these, but the database itself does not, so any other write
-- path (a bug, a future script, direct DB access) is not protected.
--
-- 1. shop_users.role has NO CHECK constraint — confirmed by reading
--    supabase/migration_multitenant.sql's CREATE TABLE (only NOT NULL
--    DEFAULT 'owner'). shop_id+user_id uniqueness IS enforced already via
--    PRIMARY KEY (shop_id, user_id) in the same statement — that part is
--    already correct, no action needed.
-- 2. profiles.email has NO UNIQUE constraint — confirmed by reading
--    supabase/rls_phase7.sql's CREATE TABLE. app/api/invite's new-account
--    detection depends on profiles.email being effectively unique; today
--    it fails CLOSED (a 500, not a wrong-account assignment) if duplicates
--    exist, because `.maybeSingle()` errors on more than one match — but a
--    proper constraint is the real fix.
--
-- Run the read-only checks first. Only run the ALTER TABLE statements if
-- both checks return zero rows — if they don't, existing bad data needs
-- cleanup before either constraint can be added, which is a separate,
-- case-by-case decision, not something to script blindly.
-- ============================================================================

-- Check 1: any shop_users rows with a role outside the 4 valid values?
SELECT shop_id, user_id, role
FROM public.shop_users
WHERE role NOT IN ('owner', 'manager', 'advisor', 'technician');

-- Check 2: any duplicate (non-null) profiles.email values?
SELECT email, COUNT(*) AS row_count, array_agg(id) AS profile_ids
FROM public.profiles
WHERE email IS NOT NULL
GROUP BY email
HAVING COUNT(*) > 1;

-- Only if Check 1 returned zero rows:
-- ALTER TABLE public.shop_users
--   ADD CONSTRAINT shop_users_role_check
--   CHECK (role IN ('owner', 'manager', 'advisor', 'technician'));

-- Only if Check 2 returned zero rows:
-- ALTER TABLE public.profiles
--   ADD CONSTRAINT profiles_email_unique UNIQUE (email);
-- ============================================================================
