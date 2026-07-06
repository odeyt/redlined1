-- ============================================================
-- Repair Intelligence — COMPLETE MIGRATION (v1 + v2 + fixes)
-- Sprint 4.1 — Integration & Stabilization
-- Run this in Supabase SQL Editor.
-- Safe to run multiple times (IF NOT EXISTS guards).
-- ============================================================

-- ─── repair_cases ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.repair_cases (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             uuid         NOT NULL,
  job_card_id         uuid,
  repair_order_id     uuid,
  vehicle_id          uuid,
  customer_id         uuid,
  vin                 text,
  make                text,
  model               text,
  year                text,
  engine              text,
  transmission        text,
  mileage             integer,
  complaint           text,
  technician_notes    text,
  final_fix           text,
  lesson_learned      text,
  labor_hours         numeric(6,2),
  ro_number           text,
  confidence_score    numeric(5,2),      -- 0–100 integer-safe; was numeric(3,2) in v1 (max 9.99)
  verification_status text         NOT NULL DEFAULT 'pending',
  is_anonymized       boolean      NOT NULL DEFAULT true,
  share_to_network    boolean      NOT NULL DEFAULT false,
  created_by          uuid,
  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now()
);

-- Add missing columns to existing table (safe no-ops if already present)
ALTER TABLE public.repair_cases
  ADD COLUMN IF NOT EXISTS transmission        text,
  ADD COLUMN IF NOT EXISTS labor_hours         numeric(6,2),
  ADD COLUMN IF NOT EXISTS lesson_learned      text,
  ADD COLUMN IF NOT EXISTS ro_number           text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending';

-- Fix confidence_score precision if table already existed with numeric(3,2)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'repair_cases'
      AND column_name  = 'confidence_score'
      AND numeric_precision = 3
  ) THEN
    ALTER TABLE public.repair_cases
      ALTER COLUMN confidence_score TYPE numeric(5,2);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS repair_cases_shop_id_idx              ON public.repair_cases (shop_id);
CREATE INDEX IF NOT EXISTS repair_cases_vehicle_id_idx           ON public.repair_cases (vehicle_id);
CREATE INDEX IF NOT EXISTS repair_cases_repair_order_id_idx      ON public.repair_cases (repair_order_id);
CREATE INDEX IF NOT EXISTS repair_cases_make_model_year_idx      ON public.repair_cases (make, model, year);
CREATE INDEX IF NOT EXISTS repair_cases_created_at_idx           ON public.repair_cases (created_at DESC);
CREATE INDEX IF NOT EXISTS repair_cases_verification_status_idx  ON public.repair_cases (verification_status);

ALTER TABLE public.repair_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "repair_cases_shop_select" ON public.repair_cases;
CREATE POLICY "repair_cases_shop_select"
  ON public.repair_cases FOR SELECT
  USING (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_cases_shop_insert" ON public.repair_cases;
CREATE POLICY "repair_cases_shop_insert"
  ON public.repair_cases FOR INSERT
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_cases_shop_update" ON public.repair_cases;
CREATE POLICY "repair_cases_shop_update"
  ON public.repair_cases FOR UPDATE
  USING  (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_cases_shop_delete" ON public.repair_cases;
CREATE POLICY "repair_cases_shop_delete"
  ON public.repair_cases FOR DELETE
  USING (shop_id = ANY(public.my_shop_ids()));

-- ─── updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS repair_cases_updated_at ON public.repair_cases;
CREATE TRIGGER repair_cases_updated_at
  BEFORE UPDATE ON public.repair_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── repair_case_dtcs ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.repair_case_dtcs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         uuid NOT NULL,
  repair_case_id  uuid NOT NULL REFERENCES public.repair_cases(id) ON DELETE CASCADE,
  code            text NOT NULL,
  description     text,
  module          text,
  status          text
);

CREATE INDEX IF NOT EXISTS repair_case_dtcs_shop_id_idx        ON public.repair_case_dtcs (shop_id);
CREATE INDEX IF NOT EXISTS repair_case_dtcs_repair_case_id_idx ON public.repair_case_dtcs (repair_case_id);
CREATE INDEX IF NOT EXISTS repair_case_dtcs_code_idx           ON public.repair_case_dtcs (code);

ALTER TABLE public.repair_case_dtcs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "repair_case_dtcs_shop_select" ON public.repair_case_dtcs;
CREATE POLICY "repair_case_dtcs_shop_select" ON public.repair_case_dtcs FOR SELECT
  USING (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_case_dtcs_shop_insert" ON public.repair_case_dtcs;
CREATE POLICY "repair_case_dtcs_shop_insert" ON public.repair_case_dtcs FOR INSERT
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_case_dtcs_shop_update" ON public.repair_case_dtcs;
CREATE POLICY "repair_case_dtcs_shop_update" ON public.repair_case_dtcs FOR UPDATE
  USING (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_case_dtcs_shop_delete" ON public.repair_case_dtcs;
CREATE POLICY "repair_case_dtcs_shop_delete" ON public.repair_case_dtcs FOR DELETE
  USING (shop_id = ANY(public.my_shop_ids()));

-- ─── repair_case_symptoms ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.repair_case_symptoms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         uuid NOT NULL,
  repair_case_id  uuid NOT NULL REFERENCES public.repair_cases(id) ON DELETE CASCADE,
  symptom         text NOT NULL,
  severity        text
);

CREATE INDEX IF NOT EXISTS repair_case_symptoms_shop_id_idx        ON public.repair_case_symptoms (shop_id);
CREATE INDEX IF NOT EXISTS repair_case_symptoms_repair_case_id_idx ON public.repair_case_symptoms (repair_case_id);

ALTER TABLE public.repair_case_symptoms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "repair_case_symptoms_shop_select" ON public.repair_case_symptoms;
CREATE POLICY "repair_case_symptoms_shop_select" ON public.repair_case_symptoms FOR SELECT
  USING (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_case_symptoms_shop_insert" ON public.repair_case_symptoms;
CREATE POLICY "repair_case_symptoms_shop_insert" ON public.repair_case_symptoms FOR INSERT
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_case_symptoms_shop_update" ON public.repair_case_symptoms;
CREATE POLICY "repair_case_symptoms_shop_update" ON public.repair_case_symptoms FOR UPDATE
  USING (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_case_symptoms_shop_delete" ON public.repair_case_symptoms;
CREATE POLICY "repair_case_symptoms_shop_delete" ON public.repair_case_symptoms FOR DELETE
  USING (shop_id = ANY(public.my_shop_ids()));

-- ─── repair_case_tests ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.repair_case_tests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         uuid NOT NULL,
  repair_case_id  uuid NOT NULL REFERENCES public.repair_cases(id) ON DELETE CASCADE,
  test_name       text NOT NULL,
  result          text,
  passed          boolean,
  notes           text
);

CREATE INDEX IF NOT EXISTS repair_case_tests_shop_id_idx        ON public.repair_case_tests (shop_id);
CREATE INDEX IF NOT EXISTS repair_case_tests_repair_case_id_idx ON public.repair_case_tests (repair_case_id);

ALTER TABLE public.repair_case_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "repair_case_tests_shop_select" ON public.repair_case_tests;
CREATE POLICY "repair_case_tests_shop_select" ON public.repair_case_tests FOR SELECT
  USING (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_case_tests_shop_insert" ON public.repair_case_tests;
CREATE POLICY "repair_case_tests_shop_insert" ON public.repair_case_tests FOR INSERT
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_case_tests_shop_update" ON public.repair_case_tests;
CREATE POLICY "repair_case_tests_shop_update" ON public.repair_case_tests FOR UPDATE
  USING (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_case_tests_shop_delete" ON public.repair_case_tests;
CREATE POLICY "repair_case_tests_shop_delete" ON public.repair_case_tests FOR DELETE
  USING (shop_id = ANY(public.my_shop_ids()));

-- ─── repair_case_parts ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.repair_case_parts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         uuid NOT NULL,
  repair_case_id  uuid NOT NULL REFERENCES public.repair_cases(id) ON DELETE CASCADE,
  part_name       text NOT NULL,
  part_number     text,
  supplier        text,
  cost            numeric(10,2),
  replaced        boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS repair_case_parts_shop_id_idx        ON public.repair_case_parts (shop_id);
CREATE INDEX IF NOT EXISTS repair_case_parts_repair_case_id_idx ON public.repair_case_parts (repair_case_id);

ALTER TABLE public.repair_case_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "repair_case_parts_shop_select" ON public.repair_case_parts;
CREATE POLICY "repair_case_parts_shop_select" ON public.repair_case_parts FOR SELECT
  USING (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_case_parts_shop_insert" ON public.repair_case_parts;
CREATE POLICY "repair_case_parts_shop_insert" ON public.repair_case_parts FOR INSERT
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_case_parts_shop_update" ON public.repair_case_parts;
CREATE POLICY "repair_case_parts_shop_update" ON public.repair_case_parts FOR UPDATE
  USING (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_case_parts_shop_delete" ON public.repair_case_parts;
CREATE POLICY "repair_case_parts_shop_delete" ON public.repair_case_parts FOR DELETE
  USING (shop_id = ANY(public.my_shop_ids()));

-- ─── repair_case_outcomes ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.repair_case_outcomes (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             uuid    NOT NULL,
  repair_case_id      uuid    NOT NULL REFERENCES public.repair_cases(id) ON DELETE CASCADE,
  outcome             text    NOT NULL,
  comeback            boolean NOT NULL DEFAULT false,
  comeback_days       integer,
  warranty_claim      boolean NOT NULL DEFAULT false,
  customer_satisfied  boolean,
  verified_fix        boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS repair_case_outcomes_shop_id_idx        ON public.repair_case_outcomes (shop_id);
CREATE INDEX IF NOT EXISTS repair_case_outcomes_repair_case_id_idx ON public.repair_case_outcomes (repair_case_id);

ALTER TABLE public.repair_case_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "repair_case_outcomes_shop_select" ON public.repair_case_outcomes;
CREATE POLICY "repair_case_outcomes_shop_select" ON public.repair_case_outcomes FOR SELECT
  USING (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_case_outcomes_shop_insert" ON public.repair_case_outcomes;
CREATE POLICY "repair_case_outcomes_shop_insert" ON public.repair_case_outcomes FOR INSERT
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_case_outcomes_shop_update" ON public.repair_case_outcomes;
CREATE POLICY "repair_case_outcomes_shop_update" ON public.repair_case_outcomes FOR UPDATE
  USING (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_case_outcomes_shop_delete" ON public.repair_case_outcomes;
CREATE POLICY "repair_case_outcomes_shop_delete" ON public.repair_case_outcomes FOR DELETE
  USING (shop_id = ANY(public.my_shop_ids()));

-- ─── Grants ───────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_cases         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_case_dtcs     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_case_symptoms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_case_tests    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_case_parts    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_case_outcomes TO authenticated;
