-- ============================================================
-- Repair Intelligence — GRANT FIX
-- Run this in Supabase SQL Editor (redlined1 project).
-- Fixes "permission denied for table repair_cases".
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_cases        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_case_dtcs    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_case_symptoms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_case_tests   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_case_parts   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_case_outcomes TO authenticated;
