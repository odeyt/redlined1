-- ═══════════════════════════════════════════════════════════════
-- MULTI-SHOP MIGRATION FIX
-- Run this after the first migration errored on shop_settings_pkey
-- Steps 1-6 already succeeded — this completes steps 7-10
-- ═══════════════════════════════════════════════════════════════

-- ── 7a. Link existing shop_settings row (id=1) to D1 Imports ────
UPDATE public.shop_settings
SET shop_id = (SELECT id FROM public.shops WHERE slug = 'd1-imports')
WHERE id = 1 AND shop_id IS NULL;

-- ── 7b. Insert Location 2 settings with explicit id=2 ────────────
INSERT INTO public.shop_settings (
  id, shop_id, company_name, tagline, labor_rate,
  default_tax_rate, invoice_prefix, estimate_prefix,
  business_type, service_types
)
SELECT
  2,
  s.id,
  'D1 Imports - Location 2',
  'Service, fleet, mobile, parts',
  145,
  0.08,
  'INV-',
  'EST-',
  'Single repair shop',
  'Oil Change,Brakes,Tires,Alignment,Engine,Transmission,Electrical,AC/Heat,Diagnostics,Inspection,Detailing,Custom'
FROM public.shops s
WHERE s.slug = 'd1-imports-location-2'
  AND NOT EXISTS (
    SELECT 1 FROM public.shop_settings WHERE id = 2
  );

-- ── 8. RLS helper function ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_shop_ids()
RETURNS UUID[] LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT ARRAY(
    SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid()
  )
$$;

-- ── 9. Shop-scoped RLS policies ───────────────────────────────────

-- Customers
DROP POLICY IF EXISTS "customers_staff_all"   ON public.customers;
DROP POLICY IF EXISTS "customers_shop_scoped" ON public.customers;
CREATE POLICY "customers_shop_scoped" ON public.customers
  FOR ALL TO authenticated
  USING    (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- Vehicles
DROP POLICY IF EXISTS "vehicles_staff_all"   ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_shop_scoped" ON public.vehicles;
CREATE POLICY "vehicles_shop_scoped" ON public.vehicles
  FOR ALL TO authenticated
  USING    (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- Job Cards
DROP POLICY IF EXISTS "job_cards_staff_all"   ON public.job_cards;
DROP POLICY IF EXISTS "job_cards_tech_update" ON public.job_cards;
DROP POLICY IF EXISTS "job_cards_shop_scoped" ON public.job_cards;
CREATE POLICY "job_cards_shop_scoped" ON public.job_cards
  FOR ALL TO authenticated
  USING    (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- Repair Orders
DROP POLICY IF EXISTS "repair_orders_staff_all"   ON public.repair_orders;
DROP POLICY IF EXISTS "repair_orders_shop_scoped" ON public.repair_orders;
CREATE POLICY "repair_orders_shop_scoped" ON public.repair_orders
  FOR ALL TO authenticated
  USING    (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- Invoices
DROP POLICY IF EXISTS "invoices_read_write"   ON public.invoices;
DROP POLICY IF EXISTS "invoices_staff_all"    ON public.invoices;
DROP POLICY IF EXISTS "invoices_shop_scoped"  ON public.invoices;
CREATE POLICY "invoices_shop_scoped" ON public.invoices
  FOR ALL TO authenticated
  USING    (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- Estimates
DROP POLICY IF EXISTS "estimates_staff_all"   ON public.estimates;
DROP POLICY IF EXISTS "estimates_shop_scoped" ON public.estimates;
CREATE POLICY "estimates_shop_scoped" ON public.estimates
  FOR ALL TO authenticated
  USING    (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- Payments
DROP POLICY IF EXISTS "payments_staff_all"   ON public.payments;
DROP POLICY IF EXISTS "payments_shop_scoped" ON public.payments;
CREATE POLICY "payments_shop_scoped" ON public.payments
  FOR ALL TO authenticated
  USING    (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- Inspections
DROP POLICY IF EXISTS "inspections_staff_all"   ON public.inspections;
DROP POLICY IF EXISTS "inspections_shop_scoped" ON public.inspections;
CREATE POLICY "inspections_shop_scoped" ON public.inspections
  FOR ALL TO authenticated
  USING    (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- Parts
DROP POLICY IF EXISTS "parts_staff_all"   ON public.parts;
DROP POLICY IF EXISTS "parts_shop_scoped" ON public.parts;
CREATE POLICY "parts_shop_scoped" ON public.parts
  FOR ALL TO authenticated
  USING    (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- Maintenance Schedules
DROP POLICY IF EXISTS "maintenance_schedules_staff_all"   ON public.maintenance_schedules;
DROP POLICY IF EXISTS "maintenance_schedules_shop_scoped" ON public.maintenance_schedules;
CREATE POLICY "maintenance_schedules_shop_scoped" ON public.maintenance_schedules
  FOR ALL TO authenticated
  USING    (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- Shop Settings
DROP POLICY IF EXISTS "shop_settings_owner"       ON public.shop_settings;
DROP POLICY IF EXISTS "shop_settings_shop_scoped" ON public.shop_settings;
CREATE POLICY "shop_settings_shop_scoped" ON public.shop_settings
  FOR ALL TO authenticated
  USING    (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- Shops table
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shops_member_view" ON public.shops;
CREATE POLICY "shops_member_view" ON public.shops
  FOR SELECT TO authenticated
  USING (id = ANY(public.my_shop_ids()));

-- Shop Users table
ALTER TABLE public.shop_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shop_users_own" ON public.shop_users;
CREATE POLICY "shop_users_own" ON public.shop_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── 10. Verify everything ─────────────────────────────────────────
SELECT 'Shops created:'        AS step, COUNT(*) AS count FROM public.shops;
SELECT 'Shop users linked:'    AS step, COUNT(*) AS count FROM public.shop_users;
SELECT 'Customers backfilled:' AS step, COUNT(*) AS count FROM public.customers  WHERE shop_id IS NOT NULL;
SELECT 'Invoices backfilled:'  AS step, COUNT(*) AS count FROM public.invoices   WHERE shop_id IS NOT NULL;
SELECT 'Payments backfilled:'  AS step, COUNT(*) AS count FROM public.payments   WHERE shop_id IS NOT NULL;
SELECT 'Shop settings rows:'   AS step, COUNT(*) AS count FROM public.shop_settings;
SELECT 'D1 Imports ID:'        AS step, id::text AS count FROM public.shops WHERE slug = 'd1-imports';
SELECT 'Location 2 ID:'        AS step, id::text AS count FROM public.shops WHERE slug = 'd1-imports-location-2';
