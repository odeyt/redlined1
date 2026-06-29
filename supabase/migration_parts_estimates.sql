-- Parts Estimates table
CREATE TABLE IF NOT EXISTS parts_estimates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  part_name           TEXT NOT NULL DEFAULT '',
  part_number         TEXT NOT NULL DEFAULT '',
  quantity            INTEGER NOT NULL DEFAULT 1,
  condition           TEXT NOT NULL DEFAULT 'New',
  line_items          JSONB NOT NULL DEFAULT '[]',
  vendor_name         TEXT NOT NULL DEFAULT '',
  vendor_phone        TEXT NOT NULL DEFAULT '',
  vendor_email        TEXT NOT NULL DEFAULT '',
  unit_cost           NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost          NUMERIC(12,2) NOT NULL DEFAULT 0,
  core_charge         NUMERIC(12,2) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'Draft',
  quote_date          DATE,
  valid_until         DATE,
  job_card_number     TEXT NOT NULL DEFAULT '',
  repair_order_number TEXT NOT NULL DEFAULT '',
  vehicle             TEXT NOT NULL DEFAULT '',
  customer_name       TEXT NOT NULL DEFAULT '',
  notes               TEXT NOT NULL DEFAULT '',
  currency            TEXT NOT NULL DEFAULT 'USD',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast shop-scoped queries
CREATE INDEX IF NOT EXISTS idx_parts_estimates_shop_id ON parts_estimates(shop_id);

-- RLS
ALTER TABLE parts_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shop members can manage their parts estimates"
  ON parts_estimates
  FOR ALL
  USING (
    shop_id IN (
      SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    )
  );
