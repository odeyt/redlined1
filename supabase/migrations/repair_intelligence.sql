-- Repair Intelligence Network — Foundation Tables
-- Creates the database schema for the repair case knowledge base.
-- Run this in Supabase SQL Editor.

-- ─── repair_cases ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.repair_cases (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id            uuid NOT NULL,
  job_card_id        uuid,
  repair_order_id    uuid,
  vehicle_id         uuid,
  customer_id        uuid,
  vin                text,
  make               text,
  model              text,
  year               text,
  engine             text,
  mileage            integer,
  complaint          text,
  technician_notes   text,
  final_fix          text,
  confidence_score   numeric(3,2),
  is_anonymized      boolean DEFAULT true,
  share_to_network   boolean DEFAULT false,
  created_by         uuid,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repair_cases_shop_id_idx         ON public.repair_cases (shop_id);
CREATE INDEX IF NOT EXISTS repair_cases_vehicle_id_idx      ON public.repair_cases (vehicle_id);
CREATE INDEX IF NOT EXISTS repair_cases_repair_order_id_idx ON public.repair_cases (repair_order_id);
CREATE INDEX IF NOT EXISTS repair_cases_make_model_year_idx ON public.repair_cases (make, model, year);
CREATE INDEX IF NOT EXISTS repair_cases_created_at_idx      ON public.repair_cases (created_at DESC);

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
  USING (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

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

CREATE INDEX IF NOT EXISTS repair_case_dtcs_shop_id_idx       ON public.repair_case_dtcs (shop_id);
CREATE INDEX IF NOT EXISTS repair_case_dtcs_repair_case_id_idx ON public.repair_case_dtcs (repair_case_id);
CREATE INDEX IF NOT EXISTS repair_case_dtcs_code_idx           ON public.repair_case_dtcs (code);

ALTER TABLE public.repair_case_dtcs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "repair_case_dtcs_shop_select" ON public.repair_case_dtcs;
CREATE POLICY "repair_case_dtcs_shop_select"
  ON public.repair_case_dtcs FOR SELECT
  USING (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_case_dtcs_shop_insert" ON public.repair_case_dtcs;
CREATE POLICY "repair_case_dtcs_shop_insert"
  ON public.repair_case_dtcs FOR INSERT
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- ─── repair_case_symptoms ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.repair_case_symptoms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         uuid NOT NULL,
  repair_case_id  uuid NOT NULL REFERENCES public.repair_cases(id) ON DELETE CASCADE,
  symptom         text NOT NULL,
  severity        text
);

CREATE INDEX IF NOT EXISTS repair_case_symptoms_shop_id_idx       ON public.repair_case_symptoms (shop_id);
CREATE INDEX IF NOT EXISTS repair_case_symptoms_repair_case_id_idx ON public.repair_case_symptoms (repair_case_id);

ALTER TABLE public.repair_case_symptoms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "repair_case_symptoms_shop_select" ON public.repair_case_symptoms;
CREATE POLICY "repair_case_symptoms_shop_select"
  ON public.repair_case_symptoms FOR SELECT
  USING (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_case_symptoms_shop_insert" ON public.repair_case_symptoms;
CREATE POLICY "repair_case_symptoms_shop_insert"
  ON public.repair_case_symptoms FOR INSERT
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

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

CREATE INDEX IF NOT EXISTS repair_case_tests_shop_id_idx       ON public.repair_case_tests (shop_id);
CREATE INDEX IF NOT EXISTS repair_case_tests_repair_case_id_idx ON public.repair_case_tests (repair_case_id);

ALTER TABLE public.repair_case_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "repair_case_tests_shop_select" ON public.repair_case_tests;
CREATE POLICY "repair_case_tests_shop_select"
  ON public.repair_case_tests FOR SELECT
  USING (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_case_tests_shop_insert" ON public.repair_case_tests;
CREATE POLICY "repair_case_tests_shop_insert"
  ON public.repair_case_tests FOR INSERT
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- ─── repair_case_parts ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.repair_case_parts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         uuid NOT NULL,
  repair_case_id  uuid NOT NULL REFERENCES public.repair_cases(id) ON DELETE CASCADE,
  part_name       text NOT NULL,
  part_number     text,
  supplier        text,
  cost            numeric(10,2),
  replaced        boolean DEFAULT true
);

CREATE INDEX IF NOT EXISTS repair_case_parts_shop_id_idx       ON public.repair_case_parts (shop_id);
CREATE INDEX IF NOT EXISTS repair_case_parts_repair_case_id_idx ON public.repair_case_parts (repair_case_id);

ALTER TABLE public.repair_case_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "repair_case_parts_shop_select" ON public.repair_case_parts;
CREATE POLICY "repair_case_parts_shop_select"
  ON public.repair_case_parts FOR SELECT
  USING (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_case_parts_shop_insert" ON public.repair_case_parts;
CREATE POLICY "repair_case_parts_shop_insert"
  ON public.repair_case_parts FOR INSERT
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- ─── repair_case_outcomes ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.repair_case_outcomes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             uuid NOT NULL,
  repair_case_id      uuid NOT NULL REFERENCES public.repair_cases(id) ON DELETE CASCADE,
  outcome             text NOT NULL,
  comeback            boolean DEFAULT false,
  comeback_days       integer,
  warranty_claim      boolean DEFAULT false,
  customer_satisfied  boolean,
  verified_fix        boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS repair_case_outcomes_shop_id_idx       ON public.repair_case_outcomes (shop_id);
CREATE INDEX IF NOT EXISTS repair_case_outcomes_repair_case_id_idx ON public.repair_case_outcomes (repair_case_id);

ALTER TABLE public.repair_case_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "repair_case_outcomes_shop_select" ON public.repair_case_outcomes;
CREATE POLICY "repair_case_outcomes_shop_select"
  ON public.repair_case_outcomes FOR SELECT
  USING (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "repair_case_outcomes_shop_insert" ON public.repair_case_outcomes;
CREATE POLICY "repair_case_outcomes_shop_insert"
  ON public.repair_case_outcomes FOR INSERT
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));
