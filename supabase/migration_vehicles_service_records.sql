-- ═══════════════════════════════════════════════════════════════════
-- VEHICLES — Add service-record fields (Notion import)
-- Run once in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS make           TEXT,
  ADD COLUMN IF NOT EXISTS model          TEXT,
  ADD COLUMN IF NOT EXISTS year           TEXT,
  ADD COLUMN IF NOT EXISTS fuel_type      TEXT,
  ADD COLUMN IF NOT EXISTS issues         TEXT,
  ADD COLUMN IF NOT EXISTS damage_intake  TEXT,
  ADD COLUMN IF NOT EXISTS issues_resolved BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS parts_exchanged TEXT,
  ADD COLUMN IF NOT EXISTS parts_needed   TEXT,
  ADD COLUMN IF NOT EXISTS flat_rate_lak  NUMERIC,
  ADD COLUMN IF NOT EXISTS image_ids      TEXT[],
  ADD COLUMN IF NOT EXISTS tech_pay_entries TEXT,
  ADD COLUMN IF NOT EXISTS assigned_tech  TEXT,
  ADD COLUMN IF NOT EXISTS date_received  DATE;
