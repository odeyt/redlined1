-- ============================================================================
-- Redlined1 — close six tables found live-exposed on 2026-09-05
-- Run in: Supabase Dashboard → SQL Editor (redlined1-prod)
-- Drafted by Claude Code, 2026-09-05. APPLIED to production 2026-09-06 —
-- re-run in the SQL Editor and confirmed via all three verification queries
-- below: audit_logs/messages/technician_tasks are RLS-enabled with zero
-- policies and zero anon/authenticated grants; campaigns/closed_jobs/
-- estimate_followups carry only their *_shop_scoped policy, no auth_all_*
-- policy anywhere in the schema. Kept here as a record of what changed and
-- why, not as a pending action.
--
-- Found while checking the "never-RLS-enabled" table list left over from
-- 2026-07-20 (see [[project_redline_live_vuln]] in memory). That list turned
-- out stale in both directions — some tables it named don't exist
-- (estimate_lines, followups, inspection_findings, parts_inventory), and
-- most of the ones that do already have a real, working shop-scoped policy.
-- But live pg_policies/pg_class/grants queries, pasted back from the SQL
-- Editor, found six that don't:
--
-- GROUP A — RLS completely disabled, full CRUD granted to `anon` (zero
-- authentication required, same severity as the original 2026-07-16
-- shops/shop_users finding):
--   audit_logs, messages, technician_tasks
--
-- GROUP B — RLS enabled, but the only policy is a blanket
-- `{authenticated} ALL USING (true)`, i.e. any signed-in account on the
-- entire platform — including a brand-new free signup — has full
-- read/write/delete access to every shop's rows:
--   campaigns (policy: auth_all_campaigns)
--   closed_jobs (policy: auth_all_closed_jobs)
--   estimate_followups (policy: auth_all_estimate_followups)
--
-- campaigns and estimate_followups already had a drafted fix sitting in
-- docs/staging-bootstrap/03_business_table_policies.sql — this confirms
-- that draft was never actually run against production, despite reading as
-- settled work if you only looked at the repo. Re-verify before trusting a
-- draft's status here, same lesson as everywhere else in this project.
--
-- ── Why Group A gets "enable RLS, no policy" rather than a real policy ──
-- audit_logs: confirmed DEAD via lib/domain/audit.ts's own header comment —
--   "since the beginning... zero rows, because nothing ever wrote to it."
--   It was superseded by public.audit_events (supabase/migrations/
--   2026-08-16_m1_domain_foundation.sql — SECURITY DEFINER insert function,
--   append-only trigger, proper shop-scoped SELECT policy). This table is
--   legacy dead weight, not a live data leak — but it still accepts
--   unauthenticated writes today, which is real exposure (free anonymous
--   storage, or path to a service that still reads it unexpectedly), just
--   not "your business data is being read."
-- messages, technician_tasks: grepped every `.from('messages')` /
--   `.from('technician_tasks')` call in the repo — zero hits, neither is
--   read or written by any current client code. Column layout unconfirmed,
--   so per the same reasoning already used once in this repo (see
--   docs/staging-bootstrap/04_close_unprotected_tables.sql, which already
--   named both of these), writing a shop_id-based policy blind risks either
--   an error (wrong column name) or a silent wrong-column policy. Enabling
--   RLS with no policy is safe regardless of the real schema: it denies
--   every role except the table owner and service_role (BYPASSRLS),
--   converting "open to the internet" into "closed until a real feature
--   needs it and gets a real policy."
--
-- ── Why Group B gets a real shop-scoped policy instead ──
-- All three confirmed via the actual service code, not just the earlier
-- draft's say-so: services/campaignService.ts uses `.in('shop_id',
-- getShopIds())` / `shop_id: getShopId()` for both campaigns and
-- estimate_followups; services/jobCardService.ts's fetchClosedJobs() does
-- the same for closed_jobs. Reusing the exact `shop_id = ANY(my_shop_ids())`
-- pattern already live on customers/job_cards/vehicles/technicians/etc.
--
-- Every DROP POLICY IF EXISTS below guards multiple plausible names,
-- because the live policy name on campaigns/estimate_followups didn't match
-- what the earlier draft assumed it would be — don't repeat that mismatch.
-- ============================================================================

BEGIN;

-- ── GROUP A: close, don't guess ─────────────────────────────────────────
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_logs FROM anon, authenticated;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.messages FROM anon, authenticated;

ALTER TABLE public.technician_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technician_tasks FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.technician_tasks FROM anon, authenticated;

-- ── GROUP B: replace the blanket policy with a real one ─────────────────
DROP POLICY IF EXISTS "auth_all_campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_staff_all" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_shop_scoped" ON public.campaigns;
CREATE POLICY "campaigns_shop_scoped" ON public.campaigns
  FOR ALL TO authenticated
  USING (shop_id = ANY (public.my_shop_ids()))
  WITH CHECK (shop_id = ANY (public.my_shop_ids()));
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.campaigns FROM anon;

DROP POLICY IF EXISTS "auth_all_closed_jobs" ON public.closed_jobs;
DROP POLICY IF EXISTS "closed_jobs_shop_scoped" ON public.closed_jobs;
CREATE POLICY "closed_jobs_shop_scoped" ON public.closed_jobs
  FOR ALL TO authenticated
  USING (shop_id = ANY (public.my_shop_ids()))
  WITH CHECK (shop_id = ANY (public.my_shop_ids()));
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.closed_jobs FROM anon;

DROP POLICY IF EXISTS "auth_all_estimate_followups" ON public.estimate_followups;
DROP POLICY IF EXISTS "estimate_followups_shop_scoped" ON public.estimate_followups;
CREATE POLICY "estimate_followups_shop_scoped" ON public.estimate_followups
  FOR ALL TO authenticated
  USING (shop_id = ANY (public.my_shop_ids()))
  WITH CHECK (shop_id = ANY (public.my_shop_ids()));
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.estimate_followups FROM anon;

COMMIT;

-- ============================================================================
-- Post-apply verification (read-only).
-- Group A: expect rls_enabled = true, rls_forced = true, zero rows in the
-- grants query for anon/authenticated on all three.
-- Group B: expect exactly one policy per table (the *_shop_scoped one),
-- and zero anon rows in the grants query.
-- ============================================================================
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('audit_logs', 'messages', 'technician_tasks', 'campaigns', 'closed_jobs', 'estimate_followups')
ORDER BY 1;

SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('audit_logs', 'messages', 'technician_tasks', 'campaigns', 'closed_jobs', 'estimate_followups')
ORDER BY tablename, policyname;

SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('audit_logs', 'messages', 'technician_tasks', 'campaigns', 'closed_jobs', 'estimate_followups')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

-- Live functional check, not just catalog state — run signed in as a real
-- staff account: campaigns list/create, closed-jobs history, and estimate
-- follow-ups should all still load and behave exactly as before. Nothing
-- legitimate depended on any of these six being open wider than this.

-- ============================================================================
-- Rollback (only if the above reveals a regression this reasoning missed).
-- Re-opens each table to its exact pre-fix live state.
-- ============================================================================
-- BEGIN;
-- ALTER TABLE public.audit_logs NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;
-- GRANT ALL ON public.audit_logs TO anon, authenticated;
--
-- ALTER TABLE public.messages NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.messages DISABLE ROW LEVEL SECURITY;
-- GRANT ALL ON public.messages TO anon, authenticated;
--
-- ALTER TABLE public.technician_tasks NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.technician_tasks DISABLE ROW LEVEL SECURITY;
-- GRANT ALL ON public.technician_tasks TO anon, authenticated;
--
-- DROP POLICY IF EXISTS "campaigns_shop_scoped" ON public.campaigns;
-- CREATE POLICY "auth_all_campaigns" ON public.campaigns
--   FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO anon;
--
-- DROP POLICY IF EXISTS "closed_jobs_shop_scoped" ON public.closed_jobs;
-- CREATE POLICY "auth_all_closed_jobs" ON public.closed_jobs
--   FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.closed_jobs TO anon;
--
-- DROP POLICY IF EXISTS "estimate_followups_shop_scoped" ON public.estimate_followups;
-- CREATE POLICY "auth_all_estimate_followups" ON public.estimate_followups
--   FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.estimate_followups TO anon;
-- COMMIT;
-- ============================================================================
