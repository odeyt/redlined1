-- Live Repair Status Tracker
-- Run in Supabase SQL Editor

ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS status_token TEXT UNIQUE;
ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS repair_stage TEXT DEFAULT 'checked_in';
ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS stage_history JSONB DEFAULT '[]';
ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS customer_email TEXT;

CREATE INDEX IF NOT EXISTS idx_job_cards_status_token ON job_cards (status_token);
