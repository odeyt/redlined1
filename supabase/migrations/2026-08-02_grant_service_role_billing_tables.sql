-- Restore service_role access to the billing tables.
--
-- Symptom: a sandbox purchase completed, the webhook verified the signature,
-- and the handler could write nothing:
--
--   permission denied for table billing_events   (service key: legacy-service-role-jwt)
--   profiles.plan update failed: permission denied for table profiles
--
-- "permission denied for table" is a GRANT failure, not RLS — RLS returns zero
-- rows with no error. So the policies are fine; service_role simply holds no
-- table privileges here. Supabase grants these by default, so either the
-- tables were created outside that default or the grants were dropped.
--
-- Granting to service_role does NOT widen customer-facing access. service_role
-- is server-only (never sent to a browser), already bypasses RLS by design, and
-- is what getAdminDb() uses for exactly these writes. Nothing here grants
-- anything to anon or authenticated — the cross-tenant work from 31 July and
-- 2 August is untouched.
--
-- Verify BEFORE and AFTER with the query at the bottom.

BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_events      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_subscriptions  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles            TO service_role;

-- Provisioning writes these on signup and at checkout.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shops               TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_users          TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_sessions TO service_role;

-- Sequences backing any of the above, so INSERT can obtain an id.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────────
-- Expect one row per table/privilege pair. Anything missing means the GRANT
-- above did not cover it.
--
--   SELECT table_name, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE grantee = 'service_role'
--     AND table_schema = 'public'
--     AND table_name IN ('billing_events','shop_subscriptions','profiles',
--                        'shops','shop_users','onboarding_sessions')
--   ORDER BY table_name, privilege_type;
--
-- And confirm nothing widened for customer-facing roles — this should return
-- only the rows you expect, and no new ones:
--
--   SELECT table_name, grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE grantee IN ('anon','authenticated')
--     AND table_schema = 'public'
--     AND table_name IN ('billing_events','shop_subscriptions')
--   ORDER BY table_name, grantee;
