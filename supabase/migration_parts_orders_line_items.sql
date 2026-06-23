-- Add line_items JSONB column to support multiple parts per order
ALTER TABLE parts_orders
  ADD COLUMN IF NOT EXISTS line_items JSONB NOT NULL DEFAULT '[]';

-- Also add Pending and Waiting Customer as valid statuses (no constraint needed, just TEXT)
-- Conditions are also TEXT, no constraint
