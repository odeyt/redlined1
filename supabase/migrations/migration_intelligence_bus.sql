-- ============================================================
-- Epic SI-2: Intelligence Bus + Recommendation Engine
-- ============================================================
-- Safe to re-run: all tables use CREATE TABLE IF NOT EXISTS
-- RLS: shop-scoped. Technicians cannot access owner recommendations.
-- ============================================================

-- ── intelligence_events ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence_events (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        text         UNIQUE NOT NULL,
  shop_id         uuid         NOT NULL,
  user_id         uuid         NULLABLE,
  event_type      text         NOT NULL,
  entity_type     text         NULLABLE,
  entity_id       uuid         NULLABLE,
  source          text         DEFAULT 'redlined1',
  payload         jsonb        DEFAULT '{}'::jsonb,
  metadata        jsonb        DEFAULT '{}'::jsonb,
  status          text         DEFAULT 'received',
  processed_at    timestamptz  NULLABLE,
  created_at      timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intelligence_events_shop_id    ON intelligence_events (shop_id);
CREATE INDEX IF NOT EXISTS idx_intelligence_events_event_type ON intelligence_events (event_type);
CREATE INDEX IF NOT EXISTS idx_intelligence_events_created_at ON intelligence_events (created_at);

ALTER TABLE intelligence_events ENABLE ROW LEVEL SECURITY;

-- Service role: full insert/update
CREATE POLICY IF NOT EXISTS "service_intelligence_events_all"
  ON intelligence_events FOR ALL
  USING (true)
  WITH CHECK (true);

-- Owner/manager: read own shop events
CREATE POLICY IF NOT EXISTS "owner_manager_intelligence_events_select"
  ON intelligence_events FOR SELECT
  USING (
    shop_id = (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'manager')
      LIMIT 1
    )
  );

-- ── recommendations ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recommendations (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id               uuid         NOT NULL,
  recommendation_key    text         NOT NULL,
  category              text         NOT NULL,
  priority              text         NOT NULL DEFAULT 'medium',
  title                 text         NOT NULL,
  description           text,
  reason                text,
  estimated_revenue     numeric      NULLABLE,
  confidence            numeric      DEFAULT 0,
  status                text         DEFAULT 'open',
  source_event_id       text         NULLABLE,
  source_entity_type    text         NULLABLE,
  source_entity_id      uuid         NULLABLE,
  action_type           text         NULLABLE,
  action_payload        jsonb        DEFAULT '{}'::jsonb,
  metadata              jsonb        DEFAULT '{}'::jsonb,
  expires_at            timestamptz  NULLABLE,
  created_at            timestamptz  DEFAULT now(),
  updated_at            timestamptz  DEFAULT now(),
  completed_at          timestamptz  NULLABLE,
  dismissed_at          timestamptz  NULLABLE,
  UNIQUE (shop_id, recommendation_key)
);

CREATE INDEX IF NOT EXISTS idx_recommendations_shop_id    ON recommendations (shop_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_category   ON recommendations (category);
CREATE INDEX IF NOT EXISTS idx_recommendations_priority   ON recommendations (priority);
CREATE INDEX IF NOT EXISTS idx_recommendations_status     ON recommendations (status);
CREATE INDEX IF NOT EXISTS idx_recommendations_created_at ON recommendations (created_at);

ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "owner_manager_recommendations_all"
  ON recommendations FOR ALL
  USING (
    shop_id = (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'manager')
      LIMIT 1
    )
  )
  WITH CHECK (
    shop_id = (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'manager')
      LIMIT 1
    )
  );

-- ── intelligence_signals ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence_signals (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      uuid         NOT NULL,
  signal_key   text         NOT NULL,
  signal_type  text         NOT NULL,
  entity_type  text         NULLABLE,
  entity_id    uuid         NULLABLE,
  value        numeric      NULLABLE,
  text_value   text         NULLABLE,
  severity     text         DEFAULT 'info',
  metadata     jsonb        DEFAULT '{}'::jsonb,
  created_at   timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intelligence_signals_shop_id    ON intelligence_signals (shop_id);
CREATE INDEX IF NOT EXISTS idx_intelligence_signals_signal_key ON intelligence_signals (signal_key);

ALTER TABLE intelligence_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "owner_manager_signals_all"
  ON intelligence_signals FOR ALL
  USING (
    shop_id = (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'manager')
      LIMIT 1
    )
  )
  WITH CHECK (
    shop_id = (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'manager')
      LIMIT 1
    )
  );

-- ── recommendation_actions ────────────────────────────────────
CREATE TABLE IF NOT EXISTS recommendation_actions (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id           uuid         NOT NULL,
  recommendation_id uuid         REFERENCES recommendations(id) ON DELETE CASCADE,
  action_label      text         NOT NULL,
  action_type       text         NOT NULL,
  action_payload    jsonb        DEFAULT '{}'::jsonb,
  status            text         DEFAULT 'available',
  created_at        timestamptz  DEFAULT now(),
  completed_at      timestamptz  NULLABLE
);

CREATE INDEX IF NOT EXISTS idx_recommendation_actions_shop_id          ON recommendation_actions (shop_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_actions_recommendation_id ON recommendation_actions (recommendation_id);

ALTER TABLE recommendation_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "owner_manager_rec_actions_all"
  ON recommendation_actions FOR ALL
  USING (
    shop_id = (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'manager')
      LIMIT 1
    )
  )
  WITH CHECK (
    shop_id = (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'manager')
      LIMIT 1
    )
  );

-- ── Intelligence feature flags (SI-2 additions) ──────────────
INSERT INTO feature_flags (flag_key, display_name, description, enabled, scope)
VALUES
  ('intelligence_bus',          'Intelligence Bus',          'Records operational events into intelligence_events table', false, 'global'),
  ('recommendation_engine',     'Recommendation Engine',     'Runs deterministic recommendation rules for shop owners', false, 'global'),
  ('daily_recommendations',     'Daily Recommendations',     'Generates fresh recommendations once per day', false, 'global')
ON CONFLICT (flag_key) DO NOTHING;


-- ── Grants (required for service_role to bypass RLS) ─────────
GRANT ALL ON TABLE recommendations TO service_role, authenticated, anon;
GRANT ALL ON TABLE intelligence_signals TO service_role, authenticated, anon;
GRANT ALL ON TABLE feature_flags TO service_role, authenticated, anon;
