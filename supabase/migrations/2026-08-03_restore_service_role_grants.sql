-- Restore service_role's table privileges across the public schema.
--
-- Audited on 2026-08-03 against every table the codebase reaches via
-- .from('...'): of 75 tables that exist, service_role could read only 39.
-- The other 36 returned 42501 "permission denied for table ...".
--
-- Supabase grants these by default, so something removed them — most likely a
-- broad REVOKE during the RLS hardening in late July. The consequence is that
-- any server-side code using getAdminDb() against those tables fails, and
-- because most of those call sites do not check their result, it fails
-- silently. That is exactly how the billing webhook wrote nothing for hours
-- while returning 200.
--
-- Tables affected included customers, appointments, inspections, technicians,
-- shop_settings, shop_mirrors, time_entries, subscriptions and usage_records.
--
-- ── Why this is not a security regression ───────────────────────────────────
--
-- service_role is the server-side key only. It is never sent to a browser, it
-- already bypasses RLS by design, and it is what getAdminDb() authenticates as.
-- Granting it table privileges restores the Supabase default.
--
-- Nothing here touches anon or authenticated, so every tenant-isolation policy
-- from 31 July and 2 August still stands unchanged. The verification block at
-- the end proves that rather than asserting it.
--
-- Granting across the schema rather than naming 36 tables is deliberate: the
-- previous migration named six tables and left thirty more broken, and a list
-- goes stale the moment a table is added. ALTER DEFAULT PRIVILEGES covers
-- tables created from here on.

BEGIN;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Future tables, so this cannot silently recur.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────────
--
-- 1. Nothing the code touches should remain unreadable by service_role.
--    Expect zero rows.
--
--   SELECT c.relname
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public'
--     AND c.relkind = 'r'
--     AND NOT has_table_privilege('service_role', c.oid, 'SELECT')
--   ORDER BY 1;
--
-- 2. Customer-facing roles must be unchanged. Compare this against the same
--    query run before the migration — the row count must be identical.
--
--   SELECT grantee, table_name, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'public'
--     AND grantee IN ('anon', 'authenticated')
--   ORDER BY table_name, grantee, privilege_type;
--
-- 3. RLS must still be enabled everywhere it was. Expect zero rows for tables
--    holding shop data — a table with relrowsecurity = false has inert
--    policies, which is how appointments leaked in an earlier round.
--
--   SELECT c.relname
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public'
--     AND c.relkind = 'r'
--     AND NOT c.relrowsecurity
--   ORDER BY 1;
