-- ═══════════════════════════════════════════════════════════════════
-- MULTI-SHOP MIGRATION — D1 Imports (2 locations)
-- Run this ONCE in Supabase SQL Editor → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Create shops table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shops (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Insert your two shops ─────────────────────────────────────
INSERT INTO public.shops (name, slug) VALUES
  ('D1 Imports', 'd1-imports'),
  ('D1 Imports - Location 2', 'd1-imports-location-2')
ON CONFLICT (slug) DO NOTHING;

-- ── 3. Shop ↔ User junction (which shops a user can access) ──────
CREATE TABLE IF NOT EXISTS public.shop_users (
  shop_id    UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (shop_id, user_id)
);

-- ── 4. Add shop_id to every data table ───────────────────────────
ALTER TABLE public.customers            ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id);
ALTER TABLE public.vehicles             ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id);
ALTER TABLE public.job_cards            ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id);
ALTER TABLE public.repair_orders        ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id);
ALTER TABLE public.invoices             ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id);
ALTER TABLE public.estimates            ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id);
ALTER TABLE public.payments             ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id);
ALTER TABLE public.inspections          ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id);
ALTER TABLE public.parts                ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id);
ALTER TABLE public.maintenance_schedules ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id);
ALTER TABLE public.shop_settings        ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id);
ALTER TABLE public.profiles             ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id);

-- Tables that may or may not exist yet — guard with DO blocks
DO $$ BEGIN ALTER TABLE public.campaigns          ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.estimate_followups  ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.technicians         ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.closed_jobs         ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.technician_tasks    ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.messages            ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.appointments        ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.audit_logs          ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id); EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ── 5. Backfill ALL existing rows to Shop 1 (D1 Imports) ─────────
DO $$
DECLARE
  shop1_id UUID;
BEGIN
  SELECT id INTO shop1_id FROM public.shops WHERE slug = 'd1-imports';

  UPDATE public.customers             SET shop_id = shop1_id WHERE shop_id IS NULL;
  UPDATE public.vehicles              SET shop_id = shop1_id WHERE shop_id IS NULL;
  UPDATE public.job_cards             SET shop_id = shop1_id WHERE shop_id IS NULL;
  UPDATE public.repair_orders         SET shop_id = shop1_id WHERE shop_id IS NULL;
  UPDATE public.invoices              SET shop_id = shop1_id WHERE shop_id IS NULL;
  UPDATE public.estimates             SET shop_id = shop1_id WHERE shop_id IS NULL;
  UPDATE public.payments              SET shop_id = shop1_id WHERE shop_id IS NULL;
  UPDATE public.inspections           SET shop_id = shop1_id WHERE shop_id IS NULL;
  UPDATE public.parts                 SET shop_id = shop1_id WHERE shop_id IS NULL;
  UPDATE public.maintenance_schedules SET shop_id = shop1_id WHERE shop_id IS NULL;
  UPDATE public.shop_settings         SET shop_id = shop1_id WHERE shop_id IS NULL;
  UPDATE public.profiles              SET shop_id = shop1_id WHERE shop_id IS NULL;

  BEGIN UPDATE public.campaigns           SET shop_id = shop1_id WHERE shop_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE public.estimate_followups   SET shop_id = shop1_id WHERE shop_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE public.technicians          SET shop_id = shop1_id WHERE shop_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE public.closed_jobs          SET shop_id = shop1_id WHERE shop_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE public.technician_tasks     SET shop_id = shop1_id WHERE shop_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE public.messages             SET shop_id = shop1_id WHERE shop_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE public.audit_logs           SET shop_id = shop1_id WHERE shop_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
END $$;

-- ── 6. Grant owner access to BOTH shops for all existing profiles ─
INSERT INTO public.shop_users (shop_id, user_id, role)
SELECT s.id, p.id, 'owner'
FROM public.shops s
CROSS JOIN public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.shop_users su
  WHERE su.shop_id = s.id AND su.user_id = p.id
);

-- ── 7. Create shop_settings row for Location 2 ───────────────────
INSERT INTO public.shop_settings (
  shop_id, company_name, tagline, labor_rate,
  default_tax_rate, invoice_prefix, estimate_prefix,
  business_type, service_types
)
SELECT
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
    SELECT 1 FROM public.shop_settings ss WHERE ss.shop_id = s.id
  );

-- ── 8. RLS helper: returns all shop IDs the current user can access
CREATE OR REPLACE FUNCTION public.my_shop_ids()
RETURNS UUID[] LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT ARRAY(
    SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid()
  )
$$;

-- ── 9. Update RLS policies to be shop-scoped ─────────────────────

-- Customers
DROP POLICY IF EXISTS "customers_staff_all"    ON public.customers;
DROP POLICY IF EXISTS "customers_shop_scoped"  ON public.customers;
CREATE POLICY "customers_shop_scoped" ON public.customers
  FOR ALL TO authenticated
  USING    (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- Vehicles
DROP POLICY IF EXISTS "vehicles_staff_all"    ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_shop_scoped"  ON public.vehicles;
CREATE POLICY "vehicles_shop_scoped" ON public.vehicles
  FOR ALL TO authenticated
  USING    (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- Job Cards
DROP POLICY IF EXISTS "job_cards_staff_all"    ON public.job_cards;
DROP POLICY IF EXISTS "job_cards_tech_update"  ON public.job_cards;
DROP POLICY IF EXISTS "job_cards_shop_scoped"  ON public.job_cards;
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
DROP POLICY IF EXISTS "shop_settings_owner"      ON public.shop_settings;
DROP POLICY IF EXISTS "shop_settings_shop_scoped" ON public.shop_settings;
CREATE POLICY "shop_settings_shop_scoped" ON public.shop_settings
  FOR ALL TO authenticated
  USING    (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- Shops table (users can see shops they belong to)
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shops_member_view" ON public.shops;
CREATE POLICY "shops_member_view" ON public.shops
  FOR SELECT TO authenticated
  USING (id = ANY(public.my_shop_ids()));

-- Shop Users (users can only see their own memberships)
ALTER TABLE public.shop_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shop_users_own" ON public.shop_users;
CREATE POLICY "shop_users_own" ON public.shop_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── 10. Verify ───────────────────────────────────────────────────
SELECT 'Shops created:' AS step, COUNT(*) AS count FROM public.shops;
SELECT 'Shop users linked:' AS step, COUNT(*) AS count FROM public.shop_users;
SELECT 'Customers backfilled:' AS step, COUNT(*) AS count FROM public.customers WHERE shop_id IS NOT NULL;
SELECT 'Invoices backfilled:' AS step, COUNT(*) AS count FROM public.invoices WHERE shop_id IS NOT NULL;
SELECT 'Payments backfilled:' AS step, COUNT(*) AS count FROM public.payments WHERE shop_id IS NOT NULL;
SELECT 'Shop settings rows:' AS step, COUNT(*) AS count FROM public.shop_settings;
