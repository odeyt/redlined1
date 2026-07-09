-- SI-4: Live Intelligence Pipeline
-- Run this in Supabase SQL Editor after migration_intelligence_bus.sql

-- ============================================================
-- TABLE: shop_intelligence_metrics
-- ============================================================

CREATE TABLE IF NOT EXISTS shop_intelligence_metrics (
  id                          uuid primary key default gen_random_uuid(),
  shop_id                     uuid not null,
  metric_date                 date not null default current_date,

  -- Revenue
  revenue_today               numeric default 0,
  revenue_yesterday           numeric default 0,
  payments_today              numeric default 0,

  -- Invoices
  unpaid_invoice_count        integer default 0,
  unpaid_invoice_total        numeric default 0,
  overdue_invoice_count       integer default 0,
  overdue_invoice_total       numeric default 0,

  -- Estimates
  open_estimate_count         integer default 0,
  stale_estimate_count        integer default 0,
  stale_estimate_total        numeric default 0,
  declined_estimate_count     integer default 0,
  approved_not_scheduled_count integer default 0,

  -- Jobs
  completed_not_invoiced_count integer default 0,
  open_job_count              integer default 0,
  stuck_job_count             integer default 0,
  repair_orders_in_progress   integer default 0,
  completed_jobs_today        integer default 0,

  -- Repair Intelligence
  repair_cases_today          integer default 0,

  -- Inventory
  low_inventory_count         integer default 0,

  -- Technicians
  technician_active_count     integer default 0,
  technician_idle_count       integer default 0,

  -- Derived health + opportunity
  shop_health_score           integer default 100,
  revenue_opportunity_total   numeric default 0,
  risk_count                  integer default 0,
  recommendation_count        integer default 0,

  -- Misc
  metadata                    jsonb default '{}'::jsonb,
  calculated_at               timestamptz default now(),
  created_at                  timestamptz default now(),
  updated_at                  timestamptz default now()
);

-- Unique: one row per shop per day (upsert target)
ALTER TABLE shop_intelligence_metrics
  DROP CONSTRAINT IF EXISTS shop_intelligence_metrics_shop_date_uq;
ALTER TABLE shop_intelligence_metrics
  ADD CONSTRAINT shop_intelligence_metrics_shop_date_uq
  UNIQUE (shop_id, metric_date);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sim_shop_id        ON shop_intelligence_metrics (shop_id);
CREATE INDEX IF NOT EXISTS idx_sim_metric_date    ON shop_intelligence_metrics (metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_sim_calculated_at  ON shop_intelligence_metrics (calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sim_health_score   ON shop_intelligence_metrics (shop_health_score);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE shop_intelligence_metrics ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically (no policy needed for service role)

-- Owner/Manager can read their own shop metrics
CREATE POLICY "shop_metrics_owner_manager_select"
  ON shop_intelligence_metrics FOR SELECT
  USING (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'manager')
    )
  );

-- ============================================================
-- FEATURE FLAGS: SI-4
-- ============================================================

INSERT INTO feature_flags (flag_key, enabled, description)
VALUES
  ('live_intelligence_pipeline', false, 'SI-4: Live data pipeline feeding Command Center with real shop metrics'),
  ('shop_metrics',               false, 'SI-4: shop_intelligence_metrics table calculation and storage'),
  ('command_center_live_data',   false, 'SI-4: Command Center reads from shop_intelligence_metrics instead of raw signals')
ON CONFLICT DO NOTHING;
