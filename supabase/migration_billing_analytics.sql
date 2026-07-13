-- ─────────────────────────────────────────────────────────────────────────────
-- RedlineD1 — Billing Analytics Migration (C-2.2)
-- Additive only. Safe to run on production — all statements use IF NOT EXISTS.
-- No existing tables modified. No data deleted.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. commercial_acquisition_costs ──────────────────────────────────────────
-- Manual acquisition cost input for CAC calculation.
-- Populated by platform owner only via internal admin route.

CREATE TABLE IF NOT EXISTS public.commercial_acquisition_costs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start          timestamptz NOT NULL,
  period_end            timestamptz NOT NULL,
  channel               text        NOT NULL DEFAULT 'direct',
  campaign_name         text,
  spend_amount          numeric(12, 2) NOT NULL DEFAULT 0,
  currency              text        NOT NULL DEFAULT 'USD',
  attributed_paid_shops integer     NOT NULL DEFAULT 0,
  notes                 text,
  created_by            uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commercial_acquisition_costs_period_idx
  ON public.commercial_acquisition_costs (period_start, period_end);

-- ── 2. billing_metric_snapshots ───────────────────────────────────────────────
-- Optional daily snapshot for trend charts.
-- Idempotent: one row per metric_date (upsert on conflict).

CREATE TABLE IF NOT EXISTS public.billing_metric_snapshots (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date          date        NOT NULL UNIQUE,
  mrr                  numeric(12, 2),
  arr                  numeric(12, 2),
  active_paid_shops    integer,
  active_trials        integer,
  past_due_count       integer,
  cancelled_count      integer,
  failed_renewals      integer,
  refunds_amount       numeric(12, 2),
  conversion_rate      numeric(6, 3),
  logo_churn_rate      numeric(6, 3),
  revenue_churn_rate   numeric(6, 3),
  arpa                 numeric(12, 2),
  estimated_ltv        numeric(12, 2),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_metric_snapshots_date_idx
  ON public.billing_metric_snapshots (metric_date DESC);

-- ── 3. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE public.commercial_acquisition_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_metric_snapshots      ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write these tables.
-- Platform owner access goes through the service-role admin client in API routes,
-- never through the anon key.

DROP POLICY IF EXISTS "acquisition_costs_service_only" ON public.commercial_acquisition_costs;
CREATE POLICY "acquisition_costs_service_only"
  ON public.commercial_acquisition_costs FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "billing_snapshots_service_only" ON public.billing_metric_snapshots;
CREATE POLICY "billing_snapshots_service_only"
  ON public.billing_metric_snapshots FOR ALL
  USING (auth.role() = 'service_role');

-- ── 4. updated_at trigger for acquisition_costs ───────────────────────────────

CREATE OR REPLACE FUNCTION public.set_acquisition_costs_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS acquisition_costs_updated_at ON public.commercial_acquisition_costs;
CREATE TRIGGER acquisition_costs_updated_at
  BEFORE UPDATE ON public.commercial_acquisition_costs
  FOR EACH ROW EXECUTE PROCEDURE public.set_acquisition_costs_updated_at();

-- ── 5. billing_events latency index ───────────────────────────────────────────
-- Supports fast webhook health queries filtered by date range.

CREATE INDEX IF NOT EXISTS billing_events_created_at_idx
  ON public.billing_events (created_at DESC);

CREATE INDEX IF NOT EXISTS billing_events_processed_at_idx
  ON public.billing_events (processed_at DESC);

-- ── 6. shop_subscriptions analytics indexes ────────────────────────────────────

CREATE INDEX IF NOT EXISTS shop_subscriptions_status_idx
  ON public.shop_subscriptions (status);

CREATE INDEX IF NOT EXISTS shop_subscriptions_trial_end_idx
  ON public.shop_subscriptions (trial_end)
  WHERE trial_end IS NOT NULL;

CREATE INDEX IF NOT EXISTS shop_subscriptions_cancelled_at_idx
  ON public.shop_subscriptions (cancelled_at)
  WHERE cancelled_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK: To undo this migration run:
--
--   DROP TABLE IF EXISTS public.commercial_acquisition_costs;
--   DROP TABLE IF EXISTS public.billing_metric_snapshots;
--   DROP FUNCTION IF EXISTS public.set_acquisition_costs_updated_at();
--   DROP INDEX IF EXISTS billing_events_created_at_idx;
--   DROP INDEX IF EXISTS billing_events_processed_at_idx;
--   DROP INDEX IF EXISTS shop_subscriptions_status_idx;
--   DROP INDEX IF EXISTS shop_subscriptions_trial_end_idx;
--   DROP INDEX IF EXISTS shop_subscriptions_cancelled_at_idx;
--
-- No existing data is affected by rollback.
-- ─────────────────────────────────────────────────────────────────────────────
