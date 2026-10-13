-- Remove TRUNCATE from the client roles on customers and estimates.
--
-- Row Level Security does not apply to TRUNCATE. The owner's read-only check
-- on 2026-10-13 found anon holding broad table privileges including TRUNCATE,
-- so the policies that stop anon reading or updating these rows do nothing
-- to stop it emptying them. No code path in this app truncates either table.
--
-- Deliberately narrow: two tables, one privilege, the two client roles and
-- PUBLIC. SELECT/INSERT/UPDATE/DELETE grants are untouched (RLS governs them,
-- and staff screens depend on them). Wider grant findings are reported
-- separately and are not changed here.
--
-- Separate from the portal token migration so either can ship or roll back
-- on its own. Verify with the aclexplode query in the PR (information_schema
-- does not list PUBLIC grants).
--
-- Rollback: 2026-10-13_revoke_client_truncate_customers_estimates_rollback.sql
-- restores exactly the grants this removes. That would reopen the hole, so
-- only use it if a real dependency on client-side TRUNCATE turns up.

BEGIN;

REVOKE TRUNCATE ON public.customers, public.estimates FROM PUBLIC, anon, authenticated;

COMMIT;
