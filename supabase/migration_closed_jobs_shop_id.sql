-- Add shop_id to closed_jobs table
ALTER TABLE closed_jobs
  ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id);

CREATE INDEX IF NOT EXISTS idx_closed_jobs_shop_id ON closed_jobs (shop_id);
