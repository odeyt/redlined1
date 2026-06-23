-- Add currency column to parts_orders (supports multi-currency pricing)
ALTER TABLE parts_orders
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
