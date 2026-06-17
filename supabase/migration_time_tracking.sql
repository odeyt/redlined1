-- Time Tracking: technician clock-in/out per job card
CREATE TABLE IF NOT EXISTS time_entries (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id           UUID        NOT NULL,
  job_card_id       TEXT,
  job_card_number   TEXT,
  technician_id     UUID,
  technician_name   TEXT        NOT NULL,
  clock_in          TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out         TIMESTAMPTZ,
  notes             TEXT        DEFAULT '',
  created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_isolation" ON time_entries
  USING (shop_id = current_setting('app.shop_id', true)::uuid);

-- Add time tracking toggle to shop_settings
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS enable_time_tracking BOOLEAN DEFAULT true;
