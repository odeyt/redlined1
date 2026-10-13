-- Rollback for 2026-10-13_customer_portal_tokens.sql.
--
-- Deletes every customer portal token: any link already given to a customer
-- stops working, and re-applying the migration issues NEW tokens rather than
-- restoring the old ones. Use this only before links are in use. Once they
-- are, close the portal path in proxy.ts instead of rolling back.
--
-- Touches nothing on public.customers except the trigger this migration added.

BEGIN;

DROP TRIGGER IF EXISTS customers_provision_portal_token ON public.customers;
DROP FUNCTION IF EXISTS public.provision_customer_portal_token();
DROP TABLE IF EXISTS public.customer_portal_tokens;
DROP FUNCTION IF EXISTS public.new_customer_portal_token();

COMMIT;
