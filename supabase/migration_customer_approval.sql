-- Customer Digital Approval for DVI
-- Run in Supabase SQL Editor

ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS customer_approval JSONB;
