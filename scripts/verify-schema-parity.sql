-- Does the second project actually match production?
--
-- Run against both databases and compare the two outputs. A clone that applied
-- without error is not the same thing as a clone that matched: `psql -f` stops
-- on the first error, but a dump that silently omitted policies would apply
-- perfectly cleanly and leave a database with no tenancy boundary at all.
--
--   psql "$PROD_DB_URL"    -f scripts/verify-schema-parity.sql
--   psql "$STAGING_DB_URL" -f scripts/verify-schema-parity.sql
--
-- Counts are per object class rather than a single total, so a mismatch says
-- which class is short instead of only that something is.

\echo '── object counts ───────────────────────────────────────────────'

SELECT 'tables'    AS object_class, count(*) AS n
  FROM pg_tables WHERE schemaname = 'public'
UNION ALL
SELECT 'views',         count(*) FROM pg_views       WHERE schemaname = 'public'
UNION ALL
SELECT 'rls policies',  count(*) FROM pg_policies    WHERE schemaname = 'public'
UNION ALL
SELECT 'functions',     count(*) FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
UNION ALL
SELECT 'triggers',      count(*) FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND NOT t.tgisinternal
UNION ALL
SELECT 'fk constraints', count(*) FROM pg_constraint c
  JOIN pg_namespace n ON n.oid = c.connamespace
  WHERE n.nspname = 'public' AND c.contype = 'f'
UNION ALL
SELECT 'indexes',       count(*) FROM pg_indexes     WHERE schemaname = 'public'
ORDER BY object_class;

\echo ''
\echo '── tables with RLS disabled (should be identical, and short) ────'

-- A table that lost its RLS flag in the clone is the failure that matters
-- most: every policy can copy across correctly and still enforce nothing if
-- the switch itself is off.
SELECT c.relname AS table_without_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind = 'r'
   AND NOT c.relrowsecurity
 ORDER BY c.relname;

\echo ''
\echo '── append-only locks on audit_events and payments ───────────────'

-- M1 and M2 rely on two separate locks: revoked grants AND a trigger. Both
-- must survive the clone, or staging would let a test do something production
-- forbids, and the suite would pass on behaviour that does not exist.
SELECT c.relname AS tbl,
       has_table_privilege('authenticated', c.oid, 'UPDATE') AS auth_can_update,
       has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_can_delete,
       (SELECT count(*) FROM pg_trigger t
         WHERE t.tgrelid = c.oid AND NOT t.tgisinternal)     AS triggers
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('audit_events', 'payments')
 ORDER BY c.relname;

\echo ''
\echo '── row counts (staging should be empty; production should not) ──'

SELECT 'customers' AS tbl, count(*) FROM public.customers
UNION ALL SELECT 'invoices', count(*) FROM public.invoices
UNION ALL SELECT 'vehicles', count(*) FROM public.vehicles
UNION ALL SELECT 'payments', count(*) FROM public.payments
ORDER BY tbl;
