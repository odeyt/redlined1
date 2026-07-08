-- Add work_lines JSONB column to repair_orders for structured work-completed line items
ALTER TABLE repair_orders
  ADD COLUMN IF NOT EXISTS work_lines JSONB DEFAULT '[]'::jsonb;
