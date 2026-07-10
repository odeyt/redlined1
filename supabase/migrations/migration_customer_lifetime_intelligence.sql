-- SI-13 Customer Lifetime Intelligence
-- Additive only. Idempotent. Full RLS. All flags default OFF.

-- ── TABLE: customer_lifetime_profiles ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_lifetime_profiles (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                     uuid        NOT NULL,
  customer_id                 uuid        NOT NULL,
  profile_status              text        NOT NULL DEFAULT 'limited',
  customer_since              timestamptz NULL,
  last_visit_at               timestamptz NULL,
  first_visit_at              timestamptz NULL,
  visit_count                 integer     NOT NULL DEFAULT 0,
  active_vehicle_count        integer     NOT NULL DEFAULT 0,
  completed_job_count         integer     NOT NULL DEFAULT 0,
  estimate_count              integer     NOT NULL DEFAULT 0,
  approved_estimate_count     integer     NOT NULL DEFAULT 0,
  declined_estimate_count     integer     NOT NULL DEFAULT 0,
  invoice_count               integer     NOT NULL DEFAULT 0,
  paid_invoice_count          integer     NOT NULL DEFAULT 0,
  unpaid_invoice_count        integer     NOT NULL DEFAULT 0,
  unpaid_balance              numeric     NOT NULL DEFAULT 0,
  lifetime_revenue            numeric     NOT NULL DEFAULT 0,
  average_invoice_value       numeric     NOT NULL DEFAULT 0,
  average_days_between_visits numeric     NULL,
  approval_rate               numeric     NULL,
  decline_rate                numeric     NULL,
  payment_reliability_score   integer     NULL,
  retention_score             integer     NULL,
  relationship_score          integer     NULL,
  customer_segment            text        NULL,
  churn_risk                  text        NULL,
  predicted_next_visit_start  date        NULL,
  predicted_next_visit_end    date        NULL,
  next_best_opportunities     jsonb       NOT NULL DEFAULT '[]',
  unresolved_declined_work    jsonb       NOT NULL DEFAULT '[]',
  active_risks                jsonb       NOT NULL DEFAULT '[]',
  important_memories          jsonb       NOT NULL DEFAULT '[]',
  metadata                    jsonb       NOT NULL DEFAULT '{}',
  calculated_at               timestamptz NOT NULL DEFAULT now(),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, customer_id)
);

ALTER TABLE customer_lifetime_profiles ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_clp_shop_id         ON customer_lifetime_profiles (shop_id);
CREATE INDEX IF NOT EXISTS idx_clp_customer_id     ON customer_lifetime_profiles (customer_id);
CREATE INDEX IF NOT EXISTS idx_clp_segment         ON customer_lifetime_profiles (customer_segment);
CREATE INDEX IF NOT EXISTS idx_clp_churn_risk      ON customer_lifetime_profiles (churn_risk);
CREATE INDEX IF NOT EXISTS idx_clp_retention_score ON customer_lifetime_profiles (retention_score);
CREATE INDEX IF NOT EXISTS idx_clp_calculated_at   ON customer_lifetime_profiles (calculated_at);

-- ── TABLE: customer_segments ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_segments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         uuid        NOT NULL,
  customer_id     uuid        NOT NULL,
  segment_key     text        NOT NULL,
  segment_label   text        NOT NULL,
  segment_reason  text        NULL,
  confidence      numeric     NOT NULL DEFAULT 0,
  evidence        jsonb       NOT NULL DEFAULT '[]',
  is_primary      boolean     NOT NULL DEFAULT false,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cs_shop_id     ON customer_segments (shop_id);
CREATE INDEX IF NOT EXISTS idx_cs_customer_id ON customer_segments (customer_id);
CREATE INDEX IF NOT EXISTS idx_cs_segment_key ON customer_segments (segment_key);
CREATE INDEX IF NOT EXISTS idx_cs_is_active   ON customer_segments (is_active);

-- ── TABLE: customer_intelligence_signals ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_intelligence_signals (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             uuid        NOT NULL,
  customer_id         uuid        NOT NULL,
  signal_key          text        NOT NULL,
  signal_type         text        NOT NULL,
  severity            text        NOT NULL DEFAULT 'info',
  title               text        NOT NULL,
  description         text        NULL,
  confidence          numeric     NOT NULL DEFAULT 0,
  estimated_revenue   numeric     NULL,
  source_entity_type  text        NULL,
  source_entity_id    uuid        NULL,
  evidence            jsonb       NOT NULL DEFAULT '[]',
  metadata            jsonb       NOT NULL DEFAULT '{}',
  is_active           boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_intelligence_signals ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cis_shop_id     ON customer_intelligence_signals (shop_id);
CREATE INDEX IF NOT EXISTS idx_cis_customer_id ON customer_intelligence_signals (customer_id);
CREATE INDEX IF NOT EXISTS idx_cis_signal_key  ON customer_intelligence_signals (signal_key);
CREATE INDEX IF NOT EXISTS idx_cis_signal_type ON customer_intelligence_signals (signal_type);
CREATE INDEX IF NOT EXISTS idx_cis_severity    ON customer_intelligence_signals (severity);
CREATE INDEX IF NOT EXISTS idx_cis_is_active   ON customer_intelligence_signals (is_active);

-- ── TABLE: customer_intelligence_events ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_intelligence_events (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             uuid        NOT NULL,
  customer_id         uuid        NOT NULL,
  event_type          text        NOT NULL,
  source_entity_type  text        NULL,
  source_entity_id    uuid        NULL,
  event_date          timestamptz NOT NULL DEFAULT now(),
  title               text        NULL,
  summary             text        NULL,
  amount              numeric     NULL,
  metadata            jsonb       NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_intelligence_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cie_shop_id     ON customer_intelligence_events (shop_id);
CREATE INDEX IF NOT EXISTS idx_cie_customer_id ON customer_intelligence_events (customer_id);
CREATE INDEX IF NOT EXISTS idx_cie_event_type  ON customer_intelligence_events (event_type);
CREATE INDEX IF NOT EXISTS idx_cie_event_date  ON customer_intelligence_events (event_date);

-- ── TABLE: customer_opportunity_outcomes ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_opportunity_outcomes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id           uuid        NOT NULL,
  customer_id       uuid        NOT NULL,
  signal_id         uuid        NULL REFERENCES customer_intelligence_signals(id) ON DELETE SET NULL,
  opportunity_type  text        NOT NULL,
  outcome_status    text        NOT NULL DEFAULT 'pending',
  expected_revenue  numeric     NULL,
  realized_revenue  numeric     NULL,
  action_taken      text        NULL,
  verified_by       uuid        NULL,
  verified_at       timestamptz NULL,
  metadata          jsonb       NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_opportunity_outcomes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_coo_shop_id        ON customer_opportunity_outcomes (shop_id);
CREATE INDEX IF NOT EXISTS idx_coo_customer_id    ON customer_opportunity_outcomes (customer_id);
CREATE INDEX IF NOT EXISTS idx_coo_outcome_status ON customer_opportunity_outcomes (outcome_status);

-- ── RLS: customer_lifetime_profiles ──────────────────────────────────────────

DROP POLICY IF EXISTS "owner_manager_clp_select" ON customer_lifetime_profiles;
CREATE POLICY "owner_manager_clp_select"
  ON customer_lifetime_profiles FOR SELECT
  USING (shop_id IN (
    SELECT shop_id FROM shop_users WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'advisor')
  ));

DROP POLICY IF EXISTS "owner_manager_clp_insert" ON customer_lifetime_profiles;
CREATE POLICY "owner_manager_clp_insert"
  ON customer_lifetime_profiles FOR INSERT
  WITH CHECK (shop_id IN (
    SELECT shop_id FROM shop_users WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
  ));

DROP POLICY IF EXISTS "owner_manager_clp_update" ON customer_lifetime_profiles;
CREATE POLICY "owner_manager_clp_update"
  ON customer_lifetime_profiles FOR UPDATE
  USING (shop_id IN (
    SELECT shop_id FROM shop_users WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
  ));

DROP POLICY IF EXISTS "service_clp_all" ON customer_lifetime_profiles;
CREATE POLICY "service_clp_all"
  ON customer_lifetime_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── RLS: customer_segments ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "owner_manager_cs_select" ON customer_segments;
CREATE POLICY "owner_manager_cs_select"
  ON customer_segments FOR SELECT
  USING (shop_id IN (
    SELECT shop_id FROM shop_users WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'advisor')
  ));

DROP POLICY IF EXISTS "owner_manager_cs_insert" ON customer_segments;
CREATE POLICY "owner_manager_cs_insert"
  ON customer_segments FOR INSERT
  WITH CHECK (shop_id IN (
    SELECT shop_id FROM shop_users WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
  ));

DROP POLICY IF EXISTS "owner_manager_cs_update" ON customer_segments;
CREATE POLICY "owner_manager_cs_update"
  ON customer_segments FOR UPDATE
  USING (shop_id IN (
    SELECT shop_id FROM shop_users WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
  ));

DROP POLICY IF EXISTS "service_cs_all" ON customer_segments;
CREATE POLICY "service_cs_all"
  ON customer_segments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── RLS: customer_intelligence_signals ───────────────────────────────────────

DROP POLICY IF EXISTS "owner_manager_cis_select" ON customer_intelligence_signals;
CREATE POLICY "owner_manager_cis_select"
  ON customer_intelligence_signals FOR SELECT
  USING (shop_id IN (
    SELECT shop_id FROM shop_users WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'advisor')
  ));

DROP POLICY IF EXISTS "owner_manager_cis_insert" ON customer_intelligence_signals;
CREATE POLICY "owner_manager_cis_insert"
  ON customer_intelligence_signals FOR INSERT
  WITH CHECK (shop_id IN (
    SELECT shop_id FROM shop_users WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
  ));

DROP POLICY IF EXISTS "service_cis_all" ON customer_intelligence_signals;
CREATE POLICY "service_cis_all"
  ON customer_intelligence_signals FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── RLS: customer_intelligence_events ────────────────────────────────────────

DROP POLICY IF EXISTS "owner_manager_cie_select" ON customer_intelligence_events;
CREATE POLICY "owner_manager_cie_select"
  ON customer_intelligence_events FOR SELECT
  USING (shop_id IN (
    SELECT shop_id FROM shop_users WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'advisor')
  ));

DROP POLICY IF EXISTS "service_cie_all" ON customer_intelligence_events;
CREATE POLICY "service_cie_all"
  ON customer_intelligence_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── RLS: customer_opportunity_outcomes ───────────────────────────────────────

DROP POLICY IF EXISTS "owner_manager_coo_select" ON customer_opportunity_outcomes;
CREATE POLICY "owner_manager_coo_select"
  ON customer_opportunity_outcomes FOR SELECT
  USING (shop_id IN (
    SELECT shop_id FROM shop_users WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'advisor')
  ));

DROP POLICY IF EXISTS "owner_manager_coo_insert" ON customer_opportunity_outcomes;
CREATE POLICY "owner_manager_coo_insert"
  ON customer_opportunity_outcomes FOR INSERT
  WITH CHECK (shop_id IN (
    SELECT shop_id FROM shop_users WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'advisor')
  ));

DROP POLICY IF EXISTS "owner_manager_coo_update" ON customer_opportunity_outcomes;
CREATE POLICY "owner_manager_coo_update"
  ON customer_opportunity_outcomes FOR UPDATE
  USING (shop_id IN (
    SELECT shop_id FROM shop_users WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'advisor')
  ));

DROP POLICY IF EXISTS "service_coo_all" ON customer_opportunity_outcomes;
CREATE POLICY "service_coo_all"
  ON customer_opportunity_outcomes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT ALL ON TABLE customer_lifetime_profiles       TO service_role, authenticated;
GRANT ALL ON TABLE customer_segments                TO service_role, authenticated;
GRANT ALL ON TABLE customer_intelligence_signals    TO service_role, authenticated;
GRANT ALL ON TABLE customer_intelligence_events     TO service_role, authenticated;
GRANT ALL ON TABLE customer_opportunity_outcomes    TO service_role, authenticated;

-- ── Feature Flags (all OFF) ───────────────────────────────────────────────────

INSERT INTO feature_flags (flag_key, display_name, description, enabled, scope)
VALUES
  ('customer_lifetime_intelligence',       'Customer Lifetime Intelligence',        'SI-13: Enable customer lifetime intelligence engine',                    false, 'global'),
  ('customer_intelligence_panel',          'Customer Intelligence Panel',           'SI-13: Show intelligence panel on customer pages',                       false, 'global'),
  ('customer_segmentation',                'Customer Segmentation',                 'SI-13: Enable customer segment classification',                          false, 'global'),
  ('customer_retention_risk',              'Customer Retention Risk',               'SI-13: Enable retention risk scoring',                                   false, 'global'),
  ('customer_revenue_opportunities',       'Customer Revenue Opportunities',        'SI-13: Enable revenue opportunity detection',                            false, 'global'),
  ('customer_intelligence_command_center', 'Customer Intelligence Command Center',  'SI-13: Show customer intelligence in Command Center',                    false, 'global'),
  ('customer_intelligence_morning_brief',  'Customer Intelligence Morning Brief',   'SI-13: Include customer insights in Morning Brief',                      false, 'global'),
  ('customer_intelligence_outcome_tracking','Customer Intelligence Outcome Tracking','SI-13: Enable outcome recording',                                       false, 'global'),
  ('customer_intelligence_auto_refresh',   'Customer Intelligence Auto Refresh',    'SI-13: Auto-refresh customer profiles (keep OFF initially)',             false, 'global'),
  ('customer_sapelee_enhancement',         'Customer Sapelee Enhancement',          'SI-13: Future Sapelee reasoning (unimplemented — keep OFF permanently)', false, 'global')
ON CONFLICT DO NOTHING;
