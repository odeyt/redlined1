-- ============================================================
-- REDLINED1 COMMERCIAL BILLING PLATFORM
-- migration_commercial_billing.sql
-- Safe to run multiple times (idempotent via IF NOT EXISTS)
-- ============================================================

-- ─── commercial_plans ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS commercial_plans (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key                text UNIQUE NOT NULL,
  name                    text NOT NULL,
  description             text,
  monthly_price           numeric,
  annual_price            numeric,
  currency                text DEFAULT 'USD',
  max_users               integer,
  max_locations           integer,
  max_vehicles            integer,
  max_job_cards_per_month integer,
  ai_credits_per_month    integer,
  storage_gb              integer,
  is_active               boolean DEFAULT true,
  metadata                jsonb DEFAULT '{}'::jsonb,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

-- ─── shop_subscriptions ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shop_subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                  uuid NOT NULL,
  plan_key                 text NOT NULL,
  status                   text NOT NULL DEFAULT 'trialing',
  billing_provider         text DEFAULT 'creem',
  provider_customer_id     text,
  provider_subscription_id text,
  trial_start              timestamptz,
  trial_end                timestamptz,
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean DEFAULT false,
  cancelled_at             timestamptz,
  past_due_at              timestamptz,
  metadata                 jsonb DEFAULT '{}'::jsonb,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);

-- ─── billing_events ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billing_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id           uuid,
  provider          text NOT NULL,
  event_type        text NOT NULL,
  provider_event_id text,
  payload           jsonb DEFAULT '{}'::jsonb,
  processed         boolean DEFAULT false,
  processed_at      timestamptz,
  error             text,
  created_at        timestamptz DEFAULT now()
);

-- ─── usage_records ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS usage_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      uuid NOT NULL,
  usage_key    text NOT NULL,
  quantity     integer DEFAULT 1,
  period_start timestamptz NOT NULL,
  period_end   timestamptz NOT NULL,
  source_type  text,
  source_id    uuid,
  metadata     jsonb DEFAULT '{}'::jsonb,
  created_at   timestamptz DEFAULT now()
);

-- ─── license_checks ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS license_checks (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id   uuid NOT NULL,
  user_id   uuid,
  check_key text NOT NULL,
  allowed   boolean NOT NULL,
  reason    text,
  metadata  jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_shop_subscriptions_shop_id   ON shop_subscriptions(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_subscriptions_status    ON shop_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_shop_subscriptions_plan_key  ON shop_subscriptions(plan_key);

CREATE INDEX IF NOT EXISTS idx_billing_events_provider_event_id ON billing_events(provider_event_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_shop_id           ON billing_events(shop_id);

CREATE INDEX IF NOT EXISTS idx_usage_records_shop_id      ON usage_records(shop_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_usage_key    ON usage_records(usage_key);
CREATE INDEX IF NOT EXISTS idx_usage_records_period_start ON usage_records(period_start);

CREATE INDEX IF NOT EXISTS idx_license_checks_shop_id   ON license_checks(shop_id);
CREATE INDEX IF NOT EXISTS idx_license_checks_check_key ON license_checks(check_key);

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE commercial_plans    ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records       ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_checks      ENABLE ROW LEVEL SECURITY;

-- commercial_plans: anyone can read active plans (public pricing)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='commercial_plans' AND policyname='plans_public_read'
  ) THEN
    CREATE POLICY plans_public_read ON commercial_plans
      FOR SELECT USING (is_active = true);
  END IF;
END $$;

-- shop_subscriptions: owners and managers can read their shop's subscription
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='shop_subscriptions' AND policyname='subscriptions_shop_read'
  ) THEN
    CREATE POLICY subscriptions_shop_read ON shop_subscriptions
      FOR SELECT USING (
        shop_id IN (
          SELECT shop_id FROM shop_users
          WHERE user_id = auth.uid()
            AND role IN ('owner', 'admin', 'manager')
        )
      );
  END IF;
END $$;

-- usage_records: owners/managers can read
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='usage_records' AND policyname='usage_shop_read'
  ) THEN
    CREATE POLICY usage_shop_read ON usage_records
      FOR SELECT USING (
        shop_id IN (
          SELECT shop_id FROM shop_users
          WHERE user_id = auth.uid()
            AND role IN ('owner', 'admin', 'manager')
        )
      );
  END IF;
END $$;

-- billing_events: service role only (no user-facing RLS policy — webhooks use service key)
-- license_checks: service role only

-- ─── Seed Plans ───────────────────────────────────────────────────────────────

INSERT INTO commercial_plans
  (plan_key, name, description, monthly_price, annual_price, currency,
   max_users, max_locations, max_vehicles, max_job_cards_per_month,
   ai_credits_per_month, storage_gb, is_active)
VALUES
  ('starter',      'Starter',      'Perfect for solo mechanics and small shops',       49,   490,  'USD',  2,    1,   500,  200,  100,  5,   true),
  ('professional', 'Professional', 'For growing shops with multiple technicians',       99,   990,  'USD',  10,   3,   2000, 1000, 500,  20,  true),
  ('business',     'Business',     'Full-featured for established multi-bay operations',199, 1990,  'USD',  25,   10,  null, null, 2000, 100, true),
  ('enterprise',   'Enterprise',   'Custom pricing for multi-location operations',      null, null, 'USD',  null, null,null, null, null, null,true)
ON CONFLICT (plan_key) DO UPDATE SET
  name                    = EXCLUDED.name,
  description             = EXCLUDED.description,
  monthly_price           = EXCLUDED.monthly_price,
  annual_price            = EXCLUDED.annual_price,
  max_users               = EXCLUDED.max_users,
  max_locations           = EXCLUDED.max_locations,
  ai_credits_per_month    = EXCLUDED.ai_credits_per_month,
  storage_gb              = EXCLUDED.storage_gb,
  updated_at              = now();

-- ─── Commercial Feature Flags Seed ───────────────────────────────────────────
-- Only inserts if feature_flags table already exists (from prior migration).
-- All commercial flags default to disabled for safety.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'feature_flags') THEN
    INSERT INTO feature_flags (flag_key, enabled, description)
    VALUES
      ('commercial_billing',       false, 'Master switch for commercial billing platform'),
      ('self_service_signup',      false, 'Allow public shop self-registration'),
      ('billing_portal',           false, 'Allow owners to manage billing via Creem portal'),
      ('subscription_enforcement', false, 'Enforce plan limits on shop operations'),
      ('trial_system',             false, 'Auto-create 14-day trial on shop signup'),
      ('usage_metering',           false, 'Track usage in usage_records table')
    ON CONFLICT (flag_key) DO NOTHING;
  END IF;
END $$;
