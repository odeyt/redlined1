-- Repair Intelligence v2 — additional columns
-- Run in Supabase SQL Editor after repair_intelligence.sql

ALTER TABLE public.repair_cases
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS lesson_learned      text,
  ADD COLUMN IF NOT EXISTS transmission        text,
  ADD COLUMN IF NOT EXISTS labor_hours         numeric(6,2),
  ADD COLUMN IF NOT EXISTS ro_number           text;

-- Index for verification status queries
CREATE INDEX IF NOT EXISTS repair_cases_verification_status_idx
  ON public.repair_cases (verification_status);
