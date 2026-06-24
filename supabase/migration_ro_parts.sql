-- Add parts JSONB array to repair_orders
ALTER TABLE repair_orders
  ADD COLUMN IF NOT EXISTS parts JSONB NOT NULL DEFAULT '[]';
