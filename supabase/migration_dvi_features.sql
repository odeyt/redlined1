-- DVI Feature Additions
-- Run in Supabase SQL Editor

-- 1. Add share_token to inspections (for shareable customer links)
ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_inspections_share_token ON inspections (share_token);

-- 2. Add inspection_template to shop_settings (for customizable DVI checklists)
ALTER TABLE shop_settings
  ADD COLUMN IF NOT EXISTS inspection_template JSONB;
