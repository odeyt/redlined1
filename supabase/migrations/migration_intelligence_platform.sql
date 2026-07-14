-- ─────────────────────────────────────────────────────────────────────────────
-- RedlineD1 Automotive Intelligence Platform — Foundation Tables
-- Additive only. No existing tables altered or dropped.
-- All feature flags default OFF. Production workflows unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── rd1_repair_patterns (Repair Intelligence Engine) ──────────────────────────
CREATE TABLE IF NOT EXISTS rd1_repair_patterns (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                 uuid,                    -- NULL = global pattern
  pattern_key             text        NOT NULL,    -- hash of shop+dtcs+root_cause
  is_global               boolean     NOT NULL DEFAULT false,
  make                    text,
  model                   text,
  year_from               integer,
  year_to                 integer,
  engine_code             text,
  dtc_codes               jsonb       NOT NULL DEFAULT '[]'::jsonb,
  symptoms                jsonb       NOT NULL DEFAULT '[]'::jsonb,
  confirmed_root_cause    text        NOT NULL,
  repair_procedure        text        NOT NULL DEFAULT '',
  parts_required          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  avg_repair_time_minutes numeric     NOT NULL DEFAULT 0,
  avg_parts_cost          numeric     NOT NULL DEFAULT 0,
  success_rate            numeric     NOT NULL DEFAULT 0 CHECK (success_rate BETWEEN 0 AND 1),
  comeback_rate           numeric     NOT NULL DEFAULT 0 CHECK (comeback_rate BETWEEN 0 AND 1),
  evidence_count          integer     NOT NULL DEFAULT 1,
  confidence_score        integer     NOT NULL DEFAULT 30 CHECK (confidence_score BETWEEN 0 AND 100),
  last_verified_at        timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pattern_key)
);

CREATE INDEX IF NOT EXISTS idx_repair_patterns_shop        ON rd1_repair_patterns(shop_id);
CREATE INDEX IF NOT EXISTS idx_repair_patterns_global      ON rd1_repair_patterns(is_global);
CREATE INDEX IF NOT EXISTS idx_repair_patterns_confidence  ON rd1_repair_patterns(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_repair_patterns_dtcs        ON rd1_repair_patterns USING gin(dtc_codes);

ALTER TABLE rd1_repair_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "repair_patterns_shop_isolation"
  ON rd1_repair_patterns FOR ALL
  USING (shop_id IS NULL OR shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── vehicle_health_scores (Vehicle Health Score Engine) ───────────────────────
CREATE TABLE IF NOT EXISTS vehicle_health_scores (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      uuid        NOT NULL,
  shop_id         uuid        NOT NULL,
  overall_score   integer     NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  risk_level      text        NOT NULL DEFAULT 'low',
  urgency         text        NOT NULL DEFAULT 'none',
  system_scores   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  active_dtc_count integer    NOT NULL DEFAULT 0,
  scored_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vehicle_id, shop_id)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_health_shop    ON vehicle_health_scores(shop_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_health_score   ON vehicle_health_scores(overall_score);
CREATE INDEX IF NOT EXISTS idx_vehicle_health_risk    ON vehicle_health_scores(risk_level);
CREATE INDEX IF NOT EXISTS idx_vehicle_health_scored  ON vehicle_health_scores(scored_at);

ALTER TABLE vehicle_health_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "vehicle_health_scores_shop_isolation"
  ON vehicle_health_scores FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── rd1_fleet_analyses (Fleet Intelligence Engine) ────────────────────────────
CREATE TABLE IF NOT EXISTS rd1_fleet_analyses (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                     uuid        NOT NULL,
  customer_id                 uuid,
  fleet_id                    uuid,
  vehicle_count               integer     NOT NULL DEFAULT 0,
  fleet_health_score          integer     NOT NULL DEFAULT 100,
  total_fleet_repair_cost     numeric     NOT NULL DEFAULT 0,
  avg_repair_cost_per_vehicle numeric     NOT NULL DEFAULT 0,
  high_maintenance_vehicles   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  recurring_failure_patterns  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  downtime_trend_days         numeric     NOT NULL DEFAULT 0,
  insights_payload            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  analyzed_at                 timestamptz NOT NULL DEFAULT now(),
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fleet_analyses_shop     ON rd1_fleet_analyses(shop_id);
CREATE INDEX IF NOT EXISTS idx_fleet_analyses_customer ON rd1_fleet_analyses(customer_id);
CREATE INDEX IF NOT EXISTS idx_fleet_analyses_score    ON rd1_fleet_analyses(fleet_health_score);

ALTER TABLE rd1_fleet_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "fleet_analyses_shop_isolation"
  ON rd1_fleet_analyses FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── rd1_failure_predictions (Predictive Failure Engine) ───────────────────────
CREATE TABLE IF NOT EXISTS rd1_failure_predictions (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id                  uuid        NOT NULL,
  shop_id                     uuid        NOT NULL,
  component                   text        NOT NULL,
  system                      text        NOT NULL,
  failure_likelihood          integer     NOT NULL CHECK (failure_likelihood BETWEEN 0 AND 100),
  remaining_useful_life_km    integer,
  remaining_useful_life_days  integer,
  confidence_band             text        NOT NULL DEFAULT 'LOW',
  evidence_sources            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  recommended_action          text        NOT NULL,
  urgency                     text        NOT NULL DEFAULT 'monitor',
  is_ai_derived               boolean     NOT NULL DEFAULT false,
  resolved_at                 timestamptz,
  predicted_at                timestamptz NOT NULL DEFAULT now(),
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_failure_predictions_vehicle   ON rd1_failure_predictions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_failure_predictions_shop      ON rd1_failure_predictions(shop_id);
CREATE INDEX IF NOT EXISTS idx_failure_predictions_urgency   ON rd1_failure_predictions(urgency);
CREATE INDEX IF NOT EXISTS idx_failure_predictions_predicted ON rd1_failure_predictions(predicted_at);

ALTER TABLE rd1_failure_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "failure_predictions_shop_isolation"
  ON rd1_failure_predictions FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── rd1_technician_scorecards (Technician Performance Engine) ─────────────────
CREATE TABLE IF NOT EXISTS rd1_technician_scorecards (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id               uuid        NOT NULL,
  shop_id                     uuid        NOT NULL,
  period_days                 integer     NOT NULL DEFAULT 90,
  period_start                timestamptz NOT NULL,
  period_end                  timestamptz NOT NULL,
  total_job_cards             integer     NOT NULL DEFAULT 0,
  first_time_fix_rate         numeric     NOT NULL DEFAULT 0,
  comeback_rate               numeric     NOT NULL DEFAULT 0,
  avg_diagnostic_minutes      numeric     NOT NULL DEFAULT 0,
  avg_repair_minutes          numeric     NOT NULL DEFAULT 0,
  total_revenue               numeric     NOT NULL DEFAULT 0,
  diagnostic_accuracy_score   integer     NOT NULL DEFAULT 0,
  efficiency_score            integer     NOT NULL DEFAULT 0,
  overall_score               integer     NOT NULL DEFAULT 0,
  strong_systems              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  weak_systems                jsonb       NOT NULL DEFAULT '[]'::jsonb,
  knowledge_gaps              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  training_recommendations    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  score_trend                 text        NOT NULL DEFAULT 'stable',
  previous_score              integer,
  generated_at                timestamptz NOT NULL DEFAULT now(),
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tech_scorecards_tech   ON rd1_technician_scorecards(technician_id);
CREATE INDEX IF NOT EXISTS idx_tech_scorecards_shop   ON rd1_technician_scorecards(shop_id);
CREATE INDEX IF NOT EXISTS idx_tech_scorecards_score  ON rd1_technician_scorecards(overall_score);

ALTER TABLE rd1_technician_scorecards ENABLE ROW LEVEL SECURITY;
-- Scorecards visible to owner and manager only — NOT to the rated technician's peers
CREATE POLICY IF NOT EXISTS "tech_scorecards_owner_manager_only"
  ON rd1_technician_scorecards FOR ALL
  USING (shop_id IN (
    SELECT shop_id FROM shop_users
    WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
  ));

-- ── rd1_revenue_opportunities (Revenue Intelligence Engine) ───────────────────
CREATE TABLE IF NOT EXISTS rd1_revenue_opportunities (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             uuid        NOT NULL,
  opportunity_type    text        NOT NULL,
  vehicle_id          uuid,
  customer_id         uuid,
  title               text        NOT NULL,
  description         text,
  estimated_revenue   numeric     NOT NULL DEFAULT 0,
  probability         numeric     NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 1),
  status              text        NOT NULL DEFAULT 'open',
  expires_at          timestamptz,
  converted_at        timestamptz,
  converted_revenue   numeric,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revenue_opp_shop     ON rd1_revenue_opportunities(shop_id);
CREATE INDEX IF NOT EXISTS idx_revenue_opp_status   ON rd1_revenue_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_revenue_opp_customer ON rd1_revenue_opportunities(customer_id);
CREATE INDEX IF NOT EXISTS idx_revenue_opp_vehicle  ON rd1_revenue_opportunities(vehicle_id);

ALTER TABLE rd1_revenue_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "revenue_opportunities_shop_isolation"
  ON rd1_revenue_opportunities FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── rd1_platform_insights (unified insight store — all engines write here) ────
CREATE TABLE IF NOT EXISTS rd1_platform_insights (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_id          text        UNIQUE NOT NULL,
  engine_id           text        NOT NULL,
  category            text        NOT NULL,
  shop_id             uuid        NOT NULL,
  entity_id           uuid,
  entity_type         text,
  title               text        NOT NULL,
  summary             text        NOT NULL,
  urgency             text        NOT NULL DEFAULT 'informational',
  confidence          integer     NOT NULL DEFAULT 0,
  evidence_ids        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  recommended_actions jsonb       NOT NULL DEFAULT '[]'::jsonb,
  is_ai_derived       boolean     NOT NULL DEFAULT false,
  is_dismissed        boolean     NOT NULL DEFAULT false,
  dismissed_by        uuid,
  dismissed_at        timestamptz,
  expires_at          timestamptz,
  metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  generated_at        timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_insights_shop     ON rd1_platform_insights(shop_id);
CREATE INDEX IF NOT EXISTS idx_platform_insights_engine   ON rd1_platform_insights(engine_id);
CREATE INDEX IF NOT EXISTS idx_platform_insights_category ON rd1_platform_insights(category);
CREATE INDEX IF NOT EXISTS idx_platform_insights_urgency  ON rd1_platform_insights(urgency);
CREATE INDEX IF NOT EXISTS idx_platform_insights_entity   ON rd1_platform_insights(entity_id);
CREATE INDEX IF NOT EXISTS idx_platform_insights_active   ON rd1_platform_insights(shop_id, is_dismissed) WHERE NOT is_dismissed;

ALTER TABLE rd1_platform_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "platform_insights_shop_isolation"
  ON rd1_platform_insights FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── rd1_platform_events (event audit log for all engines) ─────────────────────
CREATE TABLE IF NOT EXISTS rd1_platform_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        text        UNIQUE NOT NULL,
  event_type      text        NOT NULL,
  shop_id         uuid        NOT NULL,
  entity_id       uuid,
  entity_type     text,
  vehicle_id      uuid,
  customer_id     uuid,
  technician_id   uuid,
  payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  schema_version  text        NOT NULL DEFAULT '1.0',
  processed_by    jsonb       NOT NULL DEFAULT '[]'::jsonb, -- engine IDs that processed this event
  occurred_at     timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_events_shop    ON rd1_platform_events(shop_id);
CREATE INDEX IF NOT EXISTS idx_platform_events_type    ON rd1_platform_events(event_type);
CREATE INDEX IF NOT EXISTS idx_platform_events_vehicle ON rd1_platform_events(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_platform_events_occurred ON rd1_platform_events(occurred_at);

ALTER TABLE rd1_platform_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "platform_events_shop_isolation"
  ON rd1_platform_events FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ── Feature flag seeds — all default OFF ──────────────────────────────────────
INSERT INTO feature_flags (flag_key, display_name, description, enabled, scope)
VALUES
  ('fleet_intelligence_enabled',       'Fleet Intelligence Engine',         'Analyzes all vehicles in a fleet. Detects recurring failures, high-maintenance vehicles, and downtime trends.', false, 'global'),
  ('predictive_failure_enabled',       'Predictive Failure Engine',         'Predicts component failures before they occur using mileage, DTC history, and repair data.', false, 'global'),
  ('repair_intelligence_enabled',      'Repair Intelligence Engine',        'Learns from every completed repair. Builds a confirmed repair database with diagnostic path rankings.', false, 'global'),
  ('technician_performance_enabled',   'Technician Performance Engine',     'Measures first-time fix rate, comeback rate, and efficiency. Generates scorecards and training recommendations.', false, 'global'),
  ('vehicle_health_score_enabled',     'Vehicle Health Score Engine',       'Generates a 0–100 vehicle health score across all major systems.', false, 'global'),
  ('customer_intelligence_enabled',    'Customer Intelligence Engine',      'Tracks lifetime value, repair frequency, service compliance, and upsell opportunities.', false, 'global'),
  ('parts_intelligence_enabled',       'Parts Intelligence Engine',         'Analyzes parts failure trends, supplier quality, and recommends stocking levels.', false, 'global'),
  ('revenue_intelligence_enabled',     'Revenue Intelligence Engine',       'Predicts revenue opportunities from deferred repairs, missed maintenance, and at-risk customers.', false, 'global'),
  ('shop_intelligence_enabled',        'Shop Intelligence Engine',          'Monitors bay utilization, technician productivity, and workflow bottlenecks.', false, 'global'),
  ('knowledge_graph_engine_enabled',   'Knowledge Graph Engine',            'Manages the Automotive Knowledge Graph. Every verified repair strengthens future AI reasoning.', false, 'global'),
  ('ai_provider_openai_enabled',       'OpenAI Provider',                   'Enables OpenAI as a primary AI reasoning provider.', false, 'global'),
  ('ai_provider_anthropic_enabled',    'Anthropic Claude Provider',         'Enables Anthropic Claude as an independent review provider.', false, 'global'),
  ('ai_provider_gemini_enabled',       'Google Gemini Provider',            'Enables Google Gemini as an AI provider (future).', false, 'global')
ON CONFLICT (flag_key) DO NOTHING;
