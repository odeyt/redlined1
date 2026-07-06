-- ─────────────────────────────────────────────────────────────────────────────
-- Smart Job Card Integration — Database Migration
-- Adds notes column to job_cards and closed_jobs
-- Safe to run multiple times (IF NOT EXISTS)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.job_cards
  ADD COLUMN IF NOT EXISTS notes text DEFAULT '';

ALTER TABLE public.closed_jobs
  ADD COLUMN IF NOT EXISTS notes text DEFAULT '';
