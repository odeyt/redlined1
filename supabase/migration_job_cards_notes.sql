-- Add notes column to job_cards table
ALTER TABLE public.job_cards ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
