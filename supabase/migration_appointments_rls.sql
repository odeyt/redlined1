-- Fix appointments: add technician column + RLS policies
-- Run in Supabase SQL Editor

-- Add technician column if missing (safe to re-run)
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS technician TEXT DEFAULT '';

-- Enable RLS (idempotent)
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Drop old policies if any exist, then recreate
DROP POLICY IF EXISTS "appointments_read"   ON public.appointments;
DROP POLICY IF EXISTS "appointments_write"  ON public.appointments;
DROP POLICY IF EXISTS "appointments_insert" ON public.appointments;
DROP POLICY IF EXISTS "appointments_update" ON public.appointments;
DROP POLICY IF EXISTS "appointments_delete" ON public.appointments;

-- Allow authenticated users to read/write appointments for their own shops
CREATE POLICY "appointments_read" ON public.appointments
  FOR SELECT TO authenticated
  USING (
    shop_id IN (
      SELECT id FROM public.shops WHERE owner_id = auth.uid()
      UNION
      SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "appointments_insert" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    shop_id IN (
      SELECT id FROM public.shops WHERE owner_id = auth.uid()
      UNION
      SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "appointments_update" ON public.appointments
  FOR UPDATE TO authenticated
  USING (
    shop_id IN (
      SELECT id FROM public.shops WHERE owner_id = auth.uid()
      UNION
      SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "appointments_delete" ON public.appointments
  FOR DELETE TO authenticated
  USING (
    shop_id IN (
      SELECT id FROM public.shops WHERE owner_id = auth.uid()
      UNION
      SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid()
    )
  );
