-- ============================================================================
-- Phase 4/5/7 — financial-table role gate
-- DRAFTED, NOT YET APPLIED.
--
-- This task's Phase 5 requirement is specific: "Technician denied from
-- payments and subscription data" — named for payments and subscriptions,
-- not invoices/estimates generally. invoices and estimates keep their
-- existing shop-scoped (any-member) policies from
-- supabase/migration_multitenant_fix.sql unchanged; only payments and
-- subscriptions get the stricter role gate here, per that reading.
--
-- Uses current_user_can_read_financials() / current_user_has_shop_role()
-- from 20260720_01_rls_helper_functions.sql — apply that migration first.
-- ============================================================================

-- ── PAYMENTS ─────────────────────────────────────────────────────────────
-- shop_id confirmed via services/paymentService.ts's
-- `.in('shop_id', getShopIds())` pattern. Replaces the shop-scoped-but-
-- role-blind `payments_shop_scoped` (FOR ALL, any member) with three
-- separate policies: read/insert/update for owner+manager+advisor
-- (technician explicitly excluded, per this task's own naming), delete
-- further restricted to owner+manager (stricter than the read/write gate,
-- matching the intent of the older, since-superseded `payments_delete`
-- policy this schema had before the multitenant migration replaced it —
-- see docs/DATABASE_SECURITY_FINDINGS.md's "role-isolation regression
-- risk" note on this table).
DROP POLICY IF EXISTS "payments_shop_scoped" ON public.payments;
DROP POLICY IF EXISTS "payments_read_write" ON public.payments;
DROP POLICY IF EXISTS "payments_insert" ON public.payments;
DROP POLICY IF EXISTS "payments_update" ON public.payments;
DROP POLICY IF EXISTS "payments_delete" ON public.payments;

DROP POLICY IF EXISTS "payments_financial_read" ON public.payments;
CREATE POLICY "payments_financial_read" ON public.payments
  FOR SELECT
  TO authenticated
  USING (public.current_user_can_read_financials(shop_id));

DROP POLICY IF EXISTS "payments_financial_insert" ON public.payments;
CREATE POLICY "payments_financial_insert" ON public.payments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_can_read_financials(shop_id));

DROP POLICY IF EXISTS "payments_financial_update" ON public.payments;
CREATE POLICY "payments_financial_update" ON public.payments
  FOR UPDATE
  TO authenticated
  USING (public.current_user_can_read_financials(shop_id))
  WITH CHECK (public.current_user_can_read_financials(shop_id));

DROP POLICY IF EXISTS "payments_owner_manager_delete" ON public.payments;
CREATE POLICY "payments_owner_manager_delete" ON public.payments
  FOR DELETE
  TO authenticated
  USING (public.current_user_has_shop_role(shop_id, ARRAY['owner', 'manager']));


-- ── SUBSCRIPTIONS ────────────────────────────────────────────────────────
-- shop_id confirmed via commercial/onboarding/ShopProvisioningService.ts
-- and lib/photos/photoLimits.ts. Never had any RLS statement found in this
-- repo at all — this is a first-time enable, not a replacement.
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_financial_read" ON public.subscriptions;
CREATE POLICY "subscriptions_financial_read" ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (public.current_user_can_read_financials(shop_id));

-- Subscriptions are provisioned/mutated by billing webhooks and the
-- onboarding service, both of which use the service-role client (bypasses
-- RLS entirely) — see commercial/onboarding/ShopProvisioningService.ts and
-- app/api/billing/webhook/creem/route.ts. No INSERT/UPDATE/DELETE policy
-- is created for `authenticated` here deliberately: this table should stay
-- read-only for shop staff, exactly like job_status_transitions.

REVOKE ALL ON public.payments FROM anon;
REVOKE ALL ON public.subscriptions FROM anon;
