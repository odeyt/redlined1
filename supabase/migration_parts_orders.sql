-- Parts Orders: track ordered parts linked to jobs, ROs, estimates, invoices
CREATE TABLE IF NOT EXISTS parts_orders (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID          NOT NULL,

  -- Part details
  part_name       TEXT          NOT NULL,
  part_number     TEXT          DEFAULT '',
  quantity        INTEGER       NOT NULL DEFAULT 1,
  condition       TEXT          DEFAULT 'New',        -- New | OEM | Aftermarket | Remanufactured | Used

  -- Vendor
  vendor_name     TEXT          DEFAULT '',
  vendor_phone    TEXT          DEFAULT '',
  vendor_email    TEXT          DEFAULT '',

  -- Pricing
  unit_cost       NUMERIC(10,2) DEFAULT 0,
  total_cost      NUMERIC(10,2) DEFAULT 0,
  core_charge     NUMERIC(10,2) DEFAULT 0,
  deposit_paid    NUMERIC(10,2) DEFAULT 0,
  balance_due     NUMERIC(10,2) DEFAULT 0,

  -- Status
  status          TEXT          DEFAULT 'Ordered',    -- Ordered | Deposit Paid | Backordered | Received | Returned | Cancelled
  payment_status  TEXT          DEFAULT 'Unpaid',     -- Unpaid | Partial | Paid in Full

  -- Dates
  order_date      DATE          DEFAULT CURRENT_DATE,
  etr             DATE,                               -- Estimated Time of Receipt
  received_date   DATE,

  -- Links to other records
  job_card_number TEXT          DEFAULT '',
  repair_order_number TEXT      DEFAULT '',
  estimate_number TEXT          DEFAULT '',
  invoice_number  TEXT          DEFAULT '',
  vehicle         TEXT          DEFAULT '',
  customer_name   TEXT          DEFAULT '',

  -- Extra
  warranty        TEXT          DEFAULT '',
  notes           TEXT          DEFAULT '',

  created_at      TIMESTAMPTZ   DEFAULT now()
);

ALTER TABLE parts_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parts_orders_shop_scoped" ON parts_orders
  FOR ALL TO authenticated
  USING (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- Vendors reference table
CREATE TABLE IF NOT EXISTS parts_vendors (
  id        UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id   UUID  NOT NULL,
  name      TEXT  NOT NULL,
  phone     TEXT  DEFAULT '',
  email     TEXT  DEFAULT '',
  website   TEXT  DEFAULT '',
  notes     TEXT  DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(shop_id, name)
);

ALTER TABLE parts_vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parts_vendors_shop_scoped" ON parts_vendors
  FOR ALL TO authenticated
  USING (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));
