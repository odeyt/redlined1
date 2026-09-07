-- ============================================================================
-- Redlined1 — drop the leftover owner_isolation policy on four tables
-- Run in: Supabase Dashboard → SQL Editor (redlined1-prod)
-- Drafted by Claude Code, 2026-09-05. APPLIED to production 2026-09-06 —
-- re-run in the SQL Editor and confirmed via the verification query below:
-- owner_isolation is gone from all four tables, only *_shop_scoped remains.
-- Kept here as a record of what changed and why, not as a pending action.
--
-- Live-verified 2026-09-05 (pg_policies, pasted back from the SQL Editor):
-- customers, job_cards, vehicles, and technicians each carry TWO permissive
-- policies for the same commands, which Postgres OR-combines:
--
--   <table>_shop_scoped  {authenticated}  ALL
--     USING (shop_id = ANY (my_shop_ids()))  WITH CHECK (same)
--   owner_isolation      {public}         ALL
--     USING (owner_id = auth.uid())          WITH CHECK (same)
--
-- The four *_shop_scoped policies are correct and stay. owner_isolation is
-- the problem on all four, identically: it is scoped to {public} (every
-- role, anon included) and never checks shop membership at all, only
-- owner_id. Net effect: a user removed from a shop (their shop_users row
-- deleted, so the shop drops out of my_shop_ids()) keeps standing
-- SELECT/INSERT/UPDATE/DELETE access to any row they own in that shop
-- indefinitely, because owner_isolation alone is enough to satisfy RLS
-- regardless of current membership.
--
-- Not exploitable by anon: auth.uid() is NULL for an unauthenticated
-- caller, and `NULL = owner_id` is never TRUE under RLS (three-valued
-- logic), so no row can match for anon regardless of what owner_id holds.
-- This is a real but narrow gap — a departed user's own rows staying
-- reachable — not a platform-wide read like the pre-fix
-- shops/shop_users/profiles policies fixed earlier.
--
-- History: first found on customers/job_cards/vehicles on 2026-07-25 (see
-- [[project_redline_live_vuln]] in memory) and deliberately deferred that
-- day as lower priority than the blanket-`true` policies fixed then.
-- Re-verified live on 2026-09-05 — still present, unchanged, on all three
-- — and found on technicians too the same day. All four are identical in
-- shape, so one script closes all of them together rather than leaving
-- technicians fixed and the original three still open.
--
-- Grepped the whole repo for `owner_id` before drafting this: no service
-- file for any of these four tables (customersService, jobCardsService,
-- vehiclesService, technicianService) reads or writes based on it. The one
-- real hit, app/api/v1/vehicles/route.ts, explicitly REJECTS `owner_id` as
-- a client-settable field (`.strict()`, comment: "there is no field here
-- that could redirect it") — confirming the app never relied on this
-- policy, it's a leftover from an earlier design.
--
-- Safe to run as written: this only removes a policy on each table, it does
-- not touch data, does not disable RLS, and each table's own *_shop_scoped
-- policy already covers every legitimate access path.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "owner_isolation" ON public.customers;
DROP POLICY IF EXISTS "owner_isolation" ON public.job_cards;
DROP POLICY IF EXISTS "owner_isolation" ON public.vehicles;
DROP POLICY IF EXISTS "owner_isolation" ON public.technicians;

COMMIT;

-- ============================================================================
-- Post-apply verification (read-only). Expect exactly one row per table:
-- <table>_shop_scoped, {authenticated}, ALL. owner_isolation must be gone
-- from all four.
-- ============================================================================
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('customers', 'job_cards', 'vehicles', 'technicians')
ORDER BY tablename, policyname;

-- Live functional check, not just catalog state — run signed in as a real
-- staff account still a member of their shop: confirm customers, vehicles,
-- job cards, and the Technicians view all still load and behave as before.
-- Only cross-membership standing access (a departed user's own old rows)
-- goes away; nothing a current shop member does depends on owner_isolation.

-- ============================================================================
-- Rollback (only if the above reveals a regression this reasoning missed).
-- Re-creates each policy exactly as found live on 2026-09-05.
-- ============================================================================
-- BEGIN;
-- CREATE POLICY "owner_isolation" ON public.customers
--   FOR ALL TO public USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
-- CREATE POLICY "owner_isolation" ON public.job_cards
--   FOR ALL TO public USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
-- CREATE POLICY "owner_isolation" ON public.vehicles
--   FOR ALL TO public USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
-- CREATE POLICY "owner_isolation" ON public.technicians
--   FOR ALL TO public USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
-- COMMIT;
-- ============================================================================
