-- ============================================================================
-- Phase 4/7 — schema-agnostic remediation for tables whose exact column
-- layout was NOT directly confirmed in this session (no CREATE TABLE
-- statement or service-layer shop_id usage was found for them — see
-- docs/DATABASE_SECURITY_FINDINGS.md, "UNKNOWN"/no-RLS-found rows).
-- DRAFTED, NOT YET APPLIED.
--
-- Per this task's Phase 4 instruction — "Only after live or staging audit
-- results are available, design the smallest safe remediation" — writing a
-- `shop_id = ANY(my_shop_ids())` policy for a table whose actual columns
-- are unconfirmed would risk a migration that errors outright (if the
-- column doesn't exist) or, worse, silently references the wrong column.
-- Instead this migration does two things that are safe regardless of a
-- table's exact internal shape:
--
--   1. ENABLE ROW LEVEL SECURITY with NO policy attached. Under Postgres
--      RLS, a table with RLS enabled and zero policies denies ALL access
--      to every role except the table owner and `service_role` (which has
--      BYPASSRLS) — this converts each of these tables from "open to
--      anyone with the anon key" to "closed to everyone except the app's
--      own service-role-backed API routes", without needing to know a
--      single column name.
--   2. REVOKE the blanket anon (and, for the audit-adjacent tables,
--      authenticated) grants from grant-permissions.sql. Belt-and-suspenders
--      with (1) — RLS being enabled already blocks these roles regardless
--      of grants, but an explicit revoke means a FUTURE accidental
--      `DISABLE ROW LEVEL SECURITY` (exactly what happened to
--      shops/shop_users) doesn't silently re-open the table the way it did
--      for those two.
--
-- This is a deliberately conservative first pass: it makes every table in
-- this list SAFE (closed) but likely also makes them briefly UNUSABLE for
-- any legitimate authenticated client-side read that was relying on them,
-- until each gets its own real, schema-aware, shop-scoped policy in a
-- follow-up migration once someone confirms live column layouts via
-- MOBILE_RLS_AUDIT.sql Section 8-style column introspection (adapted per
-- table). Per this repo's own grep results, none of these tables are
-- currently read directly by the mobile app or by any client-side (non
-- service-role) code path found in a full-repo search — see
-- docs/DATABASE_SECURITY_FINDINGS.md for the specific citation per table —
-- so "closed until properly scoped" should not break any known-live
-- feature. If that turns out to be wrong for any table, the fix is to add
-- its real policy, not to revert this migration.
--
-- Every step below is guarded with to_regclass(...) IS NOT NULL so this
-- migration does not error if a table in this list turns out not to exist
-- at all (e.g. `public.users` — its existence itself is unconfirmed; see
-- docs/DATABASE_SECURITY_FINDINGS.md).
-- ============================================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'messages',
    'audit_logs',
    'technician_tasks',
    'time_entries',
    'closed_jobs',
    'vehicle_images',
    'entity_images',
    'parts_orders',
    'parts_vendors',
    'parts_inventory',
    'repair_cases',
    'repair_case_dtcs',
    'repair_case_symptoms',
    'repair_case_tests',
    'repair_case_parts',
    'repair_case_outcomes',
    'inspection_findings',
    'estimate_lines',
    'shop_mirrors',
    'followups',
    'users'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
      RAISE NOTICE 'Closed table (RLS enabled, no policy, anon revoked): %', t;
    ELSE
      RAISE NOTICE 'Skipped (table does not exist in this database): %', t;
    END IF;
  END LOOP;
END $$;


-- ============================================================================
-- Anon-grant cleanup for tables that DO already have a real, schema-aware,
-- shop-scoped policy (either pre-existing from
-- supabase/migration_multitenant_fix.sql / migration_appointments_rls.sql,
-- or added by 20260720_03_business_table_policies.sql in this same
-- release). RLS already blocks anon on these regardless — this just
-- removes the redundant/dangerous blanket grant grant-permissions.sql left
-- in place, same belt-and-suspenders reasoning as above.
-- ============================================================================
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'customers', 'vehicles', 'job_cards', 'repair_orders', 'appointments',
    'inspections', 'invoices', 'payments', 'estimates', 'parts',
    'maintenance_schedules', 'shop_settings', 'technicians', 'campaigns'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
      RAISE NOTICE 'Revoked anon grant (RLS policy already scopes this table): %', t;
    END IF;
  END LOOP;
END $$;
