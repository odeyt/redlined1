-- ============================================================================
-- REDLINED1 — LIVE RLS / GRANT AUDIT SCRIPT
-- Run in: Supabase Dashboard → SQL Editor, against whichever project
--         NEXT_PUBLIC_SUPABASE_URL in your target environment's .env
--         actually points to (production vs staging — confirm before running).
--
-- 100% READ-ONLY. Every statement below is a SELECT against Postgres system
-- catalogs (pg_catalog / information_schema) or a SELECT with LIMIT 0 used
-- only to prove a table is reachable. Nothing here creates, alters, drops,
-- inserts, updates, deletes, grants, or revokes anything. Safe to run
-- against production as-is.
--
-- Why this script exists: this repo's own history proves migration files
-- are not reliable evidence of what's actually live. Three separate
-- generations of RLS policy were authored for this schema —
-- supabase/rls_phase7.sql (2026-06-10, enables RLS but with
-- `USING (true)` — i.e. NOT shop-scoped — policies on most tables),
-- supabase/migration_multitenant*.sql (2026-06-13/14, replaces a SUBSET of
-- those with real `shop_id = ANY(my_shop_ids())` scoping), and
-- supabase/migration_appointments_rls.sql (2026-06-22, shop-scopes
-- appointments specifically) — and docs/PRODUCTION_SECURITY_REMEDIATION.sql
-- (2026-07-18) confirms that even after all three, `shops` and
-- `shop_users` STILL had RLS DISABLED live in production. If the
-- multitenant fix's own claims about shops/shop_users were wrong, its
-- claims about every other table cannot be assumed correct either — only
-- this live query can settle it.
--
-- HOW TO USE: run the whole script, or section by section. Copy every
-- result grid back verbatim (as text/CSV, not paraphrased) — the findings
-- in docs/LIVE_RLS_VERIFICATION.md are written provisionally, from code
-- archaeology, and are marked UNVERIFIED until real output from this
-- script replaces them.
-- ============================================================================


-- ============================================================================
-- SECTION 1 — RLS enabled/forced state for EVERY table in the public schema
-- (not a hardcoded list — this catches tables nobody remembered to name).
-- rls_enabled = false on ANY table that also has a broad GRANT (see Section 3)
-- means that table is a live, unauthenticated-readable-or-writable exposure,
-- exactly like the confirmed shops/shop_users incident.
-- ============================================================================
SELECT
  c.relname                    AS table_name,
  c.relrowsecurity              AS rls_enabled,
  c.relforcerowsecurity         AS rls_forced,
  CASE WHEN c.relrowsecurity THEN
    (SELECT COUNT(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)
  ELSE NULL END                 AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'  -- ordinary tables only
ORDER BY c.relrowsecurity ASC, c.relname;  -- RLS-disabled tables surface first


-- ============================================================================
-- SECTION 2 — every RLS policy that actually exists right now, for every
-- table, with its full USING and WITH CHECK expressions. This is the
-- ground truth for "which policy generation is actually live" — compare the
-- `qual`/`with_check` text against the three competing versions in
-- supabase/rls_phase7.sql vs supabase/migration_multitenant_fix.sql.
--
-- A row where qual/with_check is literally the text "true" is a permissive,
-- NON-shop-scoped policy — any authenticated user can hit every row in that
-- table regardless of which shop it belongs to.
-- ============================================================================
SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd            AS command,
  permissive,
  qual           AS using_expression,
  with_check     AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;


-- ============================================================================
-- SECTION 3 — table-level GRANTs to anon / authenticated / service_role for
-- every table. grant-permissions.sql (committed 2026-06-20) grants
-- `select, insert, update, delete` to `anon` on ~24 tables including
-- customers, vehicles, job_cards, invoices, payments, technicians,
-- appointments, inspections, estimates, parts, parts_orders, parts_vendors,
-- messages, audit_logs, technician_tasks, time_entries,
-- estimate_followups, closed_jobs, shop_settings, campaigns, users,
-- vehicle_images, maintenance_schedules. If RLS is disabled (or has no
-- policy scoping anon) on any table appearing below WITH an anon grant, that
-- table is fully open to an unauthenticated caller with only the public
-- anon key — read AND write.
-- ============================================================================
SELECT
  table_name,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
ORDER BY table_name, grantee, privilege_type;


-- ============================================================================
-- SECTION 4 — every SECURITY DEFINER function in the public schema, its
-- owner, whether search_path is pinned, and current EXECUTE grants.
-- public.my_shop_ids() is the helper nearly every shop-scoped RLS policy in
-- this schema depends on (SELECT ARRAY(SELECT shop_id FROM shop_users
-- WHERE user_id = auth.uid())) — if EXECUTE is missing for `authenticated`,
-- every table whose policy calls it silently fails closed (denies all
-- access) rather than failing open, per Postgres RLS semantics, but that
-- still means a broad, confusing outage, not a security hole. If EXECUTE is
-- granted to PUBLIC (i.e. anon too), that is not itself exploitable (the
-- function only returns the CALLING user's own shop_ids via auth.uid()) but
-- is unnecessary privilege — should be authenticated + service_role only.
-- public.my_role() (rls_phase7.sql) and public.handle_new_user() (the
-- auth.users insert trigger) are the other two SECURITY DEFINER functions
-- this codebase's SQL files define — check those too.
-- ============================================================================
SELECT
  p.proname                      AS function_name,
  pg_get_userbyid(p.proowner)    AS function_owner,
  p.prosecdef                    AS is_security_definer,
  COALESCE(
    (SELECT array_agg(cfg) FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path=%'),
    ARRAY['<no explicit search_path set>']
  )                               AS search_path_setting,
  pg_get_functiondef(p.oid)      AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY p.proname;

SELECT
  routine_schema,
  routine_name,
  grantee,
  privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
ORDER BY routine_name, grantee;


-- ============================================================================
-- SECTION 5 — targeted per-table checks for the exact tables named in this
-- audit's scope. Same data as Sections 1-2 filtered down for a quick read,
-- covering both the task's originally-named list AND this codebase's actual
-- table names discovered by reading the source (job_cards is the primary
-- repair-job entity used by /api/job-status; repair_orders and
-- repair_cases are separate, coexisting entities — see
-- docs/LIVE_RLS_VERIFICATION.md §"Data model note" for why there are three).
-- ============================================================================
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'shops', 'shop_users', 'profiles',
    'customers', 'vehicles',
    'job_cards', 'closed_jobs', 'repair_orders', 'repair_cases',
    'appointments', 'inspections', 'inspection_findings',
    'invoices', 'payments', 'estimates', 'estimate_lines', 'estimate_followups',
    'technicians', 'technician_tasks', 'time_entries',
    'messages', 'audit_logs',
    'entity_images', 'vehicle_images',
    'parts', 'parts_orders', 'parts_vendors', 'parts_inventory',
    'maintenance_schedules', 'shop_settings', 'campaigns', 'followups',
    'shop_mirrors'
  )
ORDER BY rls_enabled ASC, table_name;

SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'shops', 'shop_users', 'profiles',
    'customers', 'vehicles',
    'job_cards', 'closed_jobs', 'repair_orders', 'repair_cases',
    'appointments', 'inspections', 'inspection_findings',
    'invoices', 'payments', 'estimates', 'estimate_lines', 'estimate_followups',
    'technicians', 'technician_tasks', 'time_entries',
    'messages', 'audit_logs',
    'entity_images', 'vehicle_images',
    'parts', 'parts_orders', 'parts_vendors', 'parts_inventory',
    'maintenance_schedules', 'shop_settings', 'campaigns', 'followups',
    'shop_mirrors'
  )
ORDER BY tablename, cmd;


-- ============================================================================
-- SECTION 6 — tenant-isolation live probe: does removing the client's
-- .eq('shop_id', activeShopId) filter actually get blocked by RLS, or does
-- the app rely entirely on the client-side filter?
--
-- This section cannot be run as a plain SQL Editor query (the SQL Editor
-- runs as a superuser/service-role-equivalent context that BYPASSES RLS
-- entirely — running SELECT * FROM customers here will always return every
-- row, RLS or no RLS, which is exactly the trap this audit exists to avoid).
-- To actually test tenant isolation you must issue a REST call authenticated
-- AS a real low-privilege user (their access_token, not the service role
-- key), which is what these checks are for.
--
-- Run these against $SUPABASE_URL/rest/v1/... with a real user's
-- access_token (NOT the anon key alone, NOT the service role key), for a
-- user who is a member of Shop A only, targeting Shop B's known data:
--
--   curl -s "$SUPABASE_URL/rest/v1/customers?select=id,shop_id" \
--     -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $USER_A_TOKEN"
--   Expect: only rows where shop_id = Shop A's id. If any Shop B row
--   appears, RLS is not enforcing tenant isolation on customers.
--
--   curl -s "$SUPABASE_URL/rest/v1/customers?select=id,shop_id&shop_id=eq.<SHOP_B_ID>" \
--     -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $USER_A_TOKEN"
--   Expect: [] (empty). A non-empty result means the client-side shop_id
--   filter was the ONLY thing preventing cross-shop reads — RLS is not
--   actually enforcing it, and any modified/compromised client (including a
--   decompiled mobile app binary with the same anon key baked in) can read
--   Shop B's data by omitting or changing that filter.
--
-- Repeat for vehicles, job_cards, repair_orders, appointments, invoices,
-- payments, inspections, technicians, profiles, and any table Section 1
-- shows as rls_enabled = false.
-- ============================================================================
SELECT 'See comment block above — this check requires a real user access_token via REST, not a SQL Editor query.' AS note;


-- ============================================================================
-- SECTION 7 — role-security spot checks: does the schema itself constrain
-- shop_users.role to the 4 valid values the app code assumes
-- ('owner','manager','advisor','technician' in lib/serverAuth.ts /
-- lib/schemas.ts), or only rls_phase7.sql's older, different role strings
-- ('Owner','Advisor','Technician','Fleet Client' in profiles.role, used by
-- my_role())? Two different role systems exist in this codebase's SQL
-- history — profiles.role (Title Case, used by my_role() in the old
-- rls_phase7.sql policies) and shop_users.role (lowercase, used by
-- my_shop_ids()-based policies AND by lib/serverAuth.ts's requireShopRole,
-- which is what every app/api/** route actually calls). If any table's live
-- policy still calls my_role() instead of being shop_id-scoped, it is using
-- the OLD, non-shop-scoped role system, not the one the application layer
-- was built against.
-- ============================================================================

-- Any shop_users row with a role outside the 4 values the app code expects?
SELECT shop_id, user_id, role
FROM public.shop_users
WHERE role NOT IN ('owner', 'manager', 'advisor', 'technician');

-- Does a CHECK constraint exist on shop_users.role at all?
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.shop_users'::regclass AND contype = 'c';

-- profiles.role distinct values actually in use (old Title-Case system) —
-- confirms whether any live RLS policy that still calls my_role() would
-- resolve correctly, and whether profiles.role and shop_users.role have
-- drifted out of sync for the same person.
SELECT DISTINCT role, COUNT(*) FROM public.profiles GROUP BY role ORDER BY role;


-- ============================================================================
-- SECTION 8 — job_cards specific: confirm which status column is
-- authoritative. app/api/job-status/route.ts reads/writes `repair_stage`
-- (lowercase-snake: checked_in/inspecting/waiting_parts/in_repair/
-- quality_check/ready) and `stage_history` (jsonb array). Other code
-- (intelligence/evidence/builders.ts, scripts/recalculate-shop-intelligence.ts)
-- filters/reads a DIFFERENT column, `status` (Title Case: e.g. 'Completed',
-- 'Closed'), on the SAME table. Confirm both columns actually exist and
-- whether they're both populated/authoritative, or whether `status` is
-- legacy/derived, before assuming Phase B's state-machine hardening only
-- needs to touch `repair_stage`.
-- ============================================================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'job_cards'
ORDER BY ordinal_position;

SELECT repair_stage, COUNT(*) FROM public.job_cards GROUP BY repair_stage ORDER BY COUNT(*) DESC;
SELECT status, COUNT(*) FROM public.job_cards GROUP BY status ORDER BY COUNT(*) DESC;


-- ============================================================================
-- SECTION 9 — storage bucket exposure (referenced by
-- docs/SHOP_ASSETS_STORAGE_REVIEW.md — separate finding, not RLS on a
-- Postgres table, but the same class of exposure). Confirms whether the
-- `shop-assets` bucket is still public and whether Storage-level RLS
-- policies exist on storage.objects for it.
-- ============================================================================
SELECT id, name, public FROM storage.buckets ORDER BY name;

SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;

-- ============================================================================
-- END OF AUDIT SCRIPT — paste every result grid above back for analysis.
-- ============================================================================
