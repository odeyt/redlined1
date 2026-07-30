-- ============================================================================
-- Cross-shop RLS hardening  (plain, statement-by-statement version)
--
-- Bug: a signed-in user with NO membership in a shop could read that shop's
-- parts, repair_orders, invoices and shop_settings. Confirmed in production
-- 2026-07-30. customers / vehicles / job_cards were already scoped correctly.
--
-- Model: a row is visible only when its shop_id is one of the shops the caller
-- is a member of. Fail-closed. The service-role key bypasses RLS, so
-- server-side jobs and admin scripts are unaffected.
--
-- Run this whole file in the Supabase SQL editor. Safe to rerun.
-- If any statement errors, STOP and send me the error text.
-- ============================================================================

-- ── 1. Membership helper ────────────────────────────────────────────────────
-- SECURITY DEFINER so policies can read shop_users without needing a
-- recursive policy on shop_users itself.

CREATE OR REPLACE FUNCTION public.user_shop_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid();
$fn$;

GRANT EXECUTE ON FUNCTION public.user_shop_ids() TO authenticated;

-- ── 2. parts ────────────────────────────────────────────────────────────────

ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parts_select_own_shop ON public.parts;
DROP POLICY IF EXISTS parts_insert_own_shop ON public.parts;
DROP POLICY IF EXISTS parts_update_own_shop ON public.parts;
DROP POLICY IF EXISTS parts_delete_own_shop ON public.parts;

CREATE POLICY parts_select_own_shop ON public.parts
  FOR SELECT TO authenticated
  USING (shop_id IN (SELECT public.user_shop_ids()));

CREATE POLICY parts_insert_own_shop ON public.parts
  FOR INSERT TO authenticated
  WITH CHECK (shop_id IN (SELECT public.user_shop_ids()));

CREATE POLICY parts_update_own_shop ON public.parts
  FOR UPDATE TO authenticated
  USING (shop_id IN (SELECT public.user_shop_ids()))
  WITH CHECK (shop_id IN (SELECT public.user_shop_ids()));

CREATE POLICY parts_delete_own_shop ON public.parts
  FOR DELETE TO authenticated
  USING (shop_id IN (SELECT public.user_shop_ids()));

-- ── 3. repair_orders ────────────────────────────────────────────────────────

ALTER TABLE public.repair_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS repair_orders_select_own_shop ON public.repair_orders;
DROP POLICY IF EXISTS repair_orders_insert_own_shop ON public.repair_orders;
DROP POLICY IF EXISTS repair_orders_update_own_shop ON public.repair_orders;
DROP POLICY IF EXISTS repair_orders_delete_own_shop ON public.repair_orders;

CREATE POLICY repair_orders_select_own_shop ON public.repair_orders
  FOR SELECT TO authenticated
  USING (shop_id IN (SELECT public.user_shop_ids()));

CREATE POLICY repair_orders_insert_own_shop ON public.repair_orders
  FOR INSERT TO authenticated
  WITH CHECK (shop_id IN (SELECT public.user_shop_ids()));

CREATE POLICY repair_orders_update_own_shop ON public.repair_orders
  FOR UPDATE TO authenticated
  USING (shop_id IN (SELECT public.user_shop_ids()))
  WITH CHECK (shop_id IN (SELECT public.user_shop_ids()));

CREATE POLICY repair_orders_delete_own_shop ON public.repair_orders
  FOR DELETE TO authenticated
  USING (shop_id IN (SELECT public.user_shop_ids()));

-- ── 4. invoices ─────────────────────────────────────────────────────────────

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_select_own_shop ON public.invoices;
DROP POLICY IF EXISTS invoices_insert_own_shop ON public.invoices;
DROP POLICY IF EXISTS invoices_update_own_shop ON public.invoices;
DROP POLICY IF EXISTS invoices_delete_own_shop ON public.invoices;

CREATE POLICY invoices_select_own_shop ON public.invoices
  FOR SELECT TO authenticated
  USING (shop_id IN (SELECT public.user_shop_ids()));

CREATE POLICY invoices_insert_own_shop ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (shop_id IN (SELECT public.user_shop_ids()));

CREATE POLICY invoices_update_own_shop ON public.invoices
  FOR UPDATE TO authenticated
  USING (shop_id IN (SELECT public.user_shop_ids()))
  WITH CHECK (shop_id IN (SELECT public.user_shop_ids()));

CREATE POLICY invoices_delete_own_shop ON public.invoices
  FOR DELETE TO authenticated
  USING (shop_id IN (SELECT public.user_shop_ids()));

-- ── 5. shop_settings ────────────────────────────────────────────────────────

ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shop_settings_select_own_shop ON public.shop_settings;
DROP POLICY IF EXISTS shop_settings_insert_own_shop ON public.shop_settings;
DROP POLICY IF EXISTS shop_settings_update_own_shop ON public.shop_settings;
DROP POLICY IF EXISTS shop_settings_delete_own_shop ON public.shop_settings;

CREATE POLICY shop_settings_select_own_shop ON public.shop_settings
  FOR SELECT TO authenticated
  USING (shop_id IN (SELECT public.user_shop_ids()));

CREATE POLICY shop_settings_insert_own_shop ON public.shop_settings
  FOR INSERT TO authenticated
  WITH CHECK (shop_id IN (SELECT public.user_shop_ids()));

CREATE POLICY shop_settings_update_own_shop ON public.shop_settings
  FOR UPDATE TO authenticated
  USING (shop_id IN (SELECT public.user_shop_ids()))
  WITH CHECK (shop_id IN (SELECT public.user_shop_ids()));

CREATE POLICY shop_settings_delete_own_shop ON public.shop_settings
  FOR DELETE TO authenticated
  USING (shop_id IN (SELECT public.user_shop_ids()));

-- ── 6. Remove leftover permissive policies ──────────────────────────────────
-- The four tables above may still carry older, broader policies under other
-- names. Any policy is permissive-OR'd, so one loose policy defeats the rest.
-- This lists everything now on those tables — review the output: any policy
-- NOT named *_own_shop must be dropped.

SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('parts', 'repair_orders', 'invoices', 'shop_settings')
ORDER BY tablename, policyname;
