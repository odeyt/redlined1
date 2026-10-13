-- Rollback for 2026-10-13_revoke_client_truncate_customers_estimates.sql.
--
-- Re-grants TRUNCATE to anon and authenticated on customers and estimates.
-- This REOPENS the hole the migration closed (RLS does not cover TRUNCATE).
-- Only use it if a real dependency on client-side TRUNCATE is found.
--
-- PUBLIC is not re-granted: the owner's check did not report a PUBLIC grant,
-- so restoring one would add access that was not there before.

BEGIN;

GRANT TRUNCATE ON public.customers, public.estimates TO anon, authenticated;

COMMIT;
