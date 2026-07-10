-- SI-11: Intelligence Learning Engine — Database Migration
-- Additive only. Idempotent. Full RLS. All flags default OFF.

-- ── TABLE: recommendation_feedback ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recommendation_feedback (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id           uuid        NOT NULL,
  recommendation_id uuid        NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  user_id           uuid        NULL,
  feedback_type     text        NOT NULL,  -- correct|incorrect|partially_correct|useful|not_useful|needs_more_information
  usefulness_score  integer     NULL,      -- 1-5
  accuracy_score    integer     NULL,      -- 1-5
  trust_score       integer     NULL,      -- 1-5
  result_status     text        NULL,      -- unknown|successful|partially_successful|unsuccessful|not_measured
  reason_code       text        NULL,
  comment           text        NULL,
  metadata          jsonb       NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recommendation_feedback ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rf_shop_id        ON recommendation_feedback (shop_id);
CREATE INDEX IF NOT EXISTS idx_rf_recommendation ON recommendation_feedback (recommendation_id);
CREATE INDEX IF NOT EXISTS idx_rf_feedback_type  ON recommendation_feedback (feedback_type);
CREATE INDEX IF NOT EXISTS idx_rf_created_at     ON recommendation_feedback (created_at);

-- ── TABLE: recommendation_learning_profiles ───────────────────────────────────

CREATE TABLE IF NOT EXISTS recommendation_learning_profiles (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                         uuid        NOT NULL,
  rule_key                        text        NOT NULL,
  category                        text        NOT NULL,
  total_recommendations           integer     NOT NULL DEFAULT 0,
  acted_upon_count                integer     NOT NULL DEFAULT 0,
  completed_count                 integer     NOT NULL DEFAULT 0,
  dismissed_count                 integer     NOT NULL DEFAULT 0,
  correct_count                   integer     NOT NULL DEFAULT 0,
  incorrect_count                 integer     NOT NULL DEFAULT 0,
  partially_correct_count         integer     NOT NULL DEFAULT 0,
  successful_outcome_count        integer     NOT NULL DEFAULT 0,
  failed_outcome_count            integer     NOT NULL DEFAULT 0,
  total_revenue_realized          numeric     NOT NULL DEFAULT 0,
  average_revenue_realized        numeric     NOT NULL DEFAULT 0,
  average_usefulness              numeric     NOT NULL DEFAULT 0,
  average_accuracy                numeric     NOT NULL DEFAULT 0,
  average_trust                   numeric     NOT NULL DEFAULT 0,
  learned_confidence_adjustment   numeric     NOT NULL DEFAULT 0,
  ranking_adjustment              numeric     NOT NULL DEFAULT 0,
  sample_size                     integer     NOT NULL DEFAULT 0,
  last_calculated_at              timestamptz NULL,
  metadata                        jsonb       NOT NULL DEFAULT '{}',
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, rule_key)
);

ALTER TABLE recommendation_learning_profiles ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rlp_shop_id    ON recommendation_learning_profiles (shop_id);
CREATE INDEX IF NOT EXISTS idx_rlp_rule_key   ON recommendation_learning_profiles (rule_key);
CREATE INDEX IF NOT EXISTS idx_rlp_category   ON recommendation_learning_profiles (category);

-- ── TABLE: recommendation_learning_events ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS recommendation_learning_events (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id           uuid        NOT NULL,
  recommendation_id uuid        NULL REFERENCES recommendations(id) ON DELETE SET NULL,
  rule_key          text        NULL,
  event_type        text        NOT NULL,
  previous_value    numeric     NULL,
  new_value         numeric     NULL,
  reason            text        NULL,
  metadata          jsonb       NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recommendation_learning_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rle_shop_id    ON recommendation_learning_events (shop_id);
CREATE INDEX IF NOT EXISTS idx_rle_rule_key   ON recommendation_learning_events (rule_key);
CREATE INDEX IF NOT EXISTS idx_rle_event_type ON recommendation_learning_events (event_type);
CREATE INDEX IF NOT EXISTS idx_rle_created_at ON recommendation_learning_events (created_at);

-- ── TABLE: recommendation_value_attribution ───────────────────────────────────

CREATE TABLE IF NOT EXISTS recommendation_value_attribution (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                     uuid        NOT NULL,
  recommendation_id           uuid        NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  source_entity_type          text        NULL,
  source_entity_id            uuid        NULL,
  expected_revenue            numeric     NULL,
  realized_revenue            numeric     NULL,
  expected_time_saved_minutes numeric     NULL,
  realized_time_saved_minutes numeric     NULL,
  risk_reduction_score        numeric     NULL,
  attribution_status          text        NOT NULL DEFAULT 'pending',  -- pending|verified|rejected
  attribution_method          text        NOT NULL DEFAULT 'manual',   -- manual|automatic
  verified_by                 uuid        NULL,
  verified_at                 timestamptz NULL,
  metadata                    jsonb       NOT NULL DEFAULT '{}',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recommendation_value_attribution ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rva_shop_id            ON recommendation_value_attribution (shop_id);
CREATE INDEX IF NOT EXISTS idx_rva_recommendation_id  ON recommendation_value_attribution (recommendation_id);
CREATE INDEX IF NOT EXISTS idx_rva_attribution_status ON recommendation_value_attribution (attribution_status);

-- ── RLS Policies: recommendation_feedback ─────────────────────────────────────

DROP POLICY IF EXISTS "owner_manager_rf_select" ON recommendation_feedback;
CREATE POLICY "owner_manager_rf_select"
  ON recommendation_feedback FOR SELECT
  USING (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'manager')
    )
  );

DROP POLICY IF EXISTS "owner_manager_rf_insert" ON recommendation_feedback;
CREATE POLICY "owner_manager_rf_insert"
  ON recommendation_feedback FOR INSERT
  WITH CHECK (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'manager')
    )
  );

DROP POLICY IF EXISTS "service_rf_all" ON recommendation_feedback;
CREATE POLICY "service_rf_all"
  ON recommendation_feedback FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── RLS Policies: recommendation_learning_profiles ────────────────────────────

DROP POLICY IF EXISTS "owner_manager_rlp_select" ON recommendation_learning_profiles;
CREATE POLICY "owner_manager_rlp_select"
  ON recommendation_learning_profiles FOR SELECT
  USING (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'manager')
    )
  );

DROP POLICY IF EXISTS "service_rlp_all" ON recommendation_learning_profiles;
CREATE POLICY "service_rlp_all"
  ON recommendation_learning_profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── RLS Policies: recommendation_learning_events ──────────────────────────────

DROP POLICY IF EXISTS "owner_manager_rle_select" ON recommendation_learning_events;
CREATE POLICY "owner_manager_rle_select"
  ON recommendation_learning_events FOR SELECT
  USING (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'manager')
    )
  );

DROP POLICY IF EXISTS "service_rle_all" ON recommendation_learning_events;
CREATE POLICY "service_rle_all"
  ON recommendation_learning_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── RLS Policies: recommendation_value_attribution ────────────────────────────

DROP POLICY IF EXISTS "owner_manager_rva_select" ON recommendation_value_attribution;
CREATE POLICY "owner_manager_rva_select"
  ON recommendation_value_attribution FOR SELECT
  USING (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'manager')
    )
  );

DROP POLICY IF EXISTS "owner_manager_rva_insert" ON recommendation_value_attribution;
CREATE POLICY "owner_manager_rva_insert"
  ON recommendation_value_attribution FOR INSERT
  WITH CHECK (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'manager')
    )
  );

DROP POLICY IF EXISTS "service_rva_all" ON recommendation_value_attribution;
CREATE POLICY "service_rva_all"
  ON recommendation_value_attribution FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT ALL ON TABLE recommendation_feedback             TO service_role, authenticated;
GRANT ALL ON TABLE recommendation_learning_profiles    TO service_role, authenticated;
GRANT ALL ON TABLE recommendation_learning_events      TO service_role, authenticated;
GRANT ALL ON TABLE recommendation_value_attribution    TO service_role, authenticated;

-- ── Feature Flags (all OFF by default) ───────────────────────────────────────

INSERT INTO feature_flags (flag_key, display_name, description, enabled, scope)
VALUES
  ('intelligence_learning_engine',    'Intelligence Learning Engine',    'SI-11: Enable learning engine infrastructure',                 false, 'global'),
  ('recommendation_feedback',         'Recommendation Feedback',         'SI-11: Allow staff to submit recommendation feedback',         false, 'global'),
  ('learning_score_adjustments',      'Learning Score Adjustments',      'SI-11: Apply learned adjustments to recommendation scores',    false, 'global'),
  ('intelligence_learning_dashboard', 'Intelligence Learning Dashboard',  'SI-11: Show learning metrics in Command Center',               false, 'global'),
  ('value_attribution',               'Value Attribution',               'SI-11: Enable revenue/time attribution tracking',             false, 'global')
ON CONFLICT DO NOTHING;
