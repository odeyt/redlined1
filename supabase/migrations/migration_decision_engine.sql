-- SI-6: Executive Decision Engine
-- Deterministic scoring and ranking of recommendations.
-- No AI. No ML. No external calls. Fail-safe.

-- ── decision_scores ───────────────────────────────────────────
-- Stores computed sub-scores for each recommendation.

CREATE TABLE IF NOT EXISTS public.decision_scores (
  id                        uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                   uuid          NOT NULL,
  recommendation_id         uuid          NOT NULL,
  recommendation_key        text          NOT NULL,
  revenue_score             numeric       NOT NULL DEFAULT 0,
  risk_score                numeric       NOT NULL DEFAULT 0,
  urgency_score             numeric       NOT NULL DEFAULT 0,
  time_efficiency_score     numeric       NOT NULL DEFAULT 0,
  cash_flow_score           numeric       NOT NULL DEFAULT 0,
  customer_impact_score     numeric       NOT NULL DEFAULT 0,
  technician_impact_score   numeric       NOT NULL DEFAULT 0,
  knowledge_impact_score    numeric       NOT NULL DEFAULT 0,
  confidence_multiplier     numeric       NOT NULL DEFAULT 1.0,
  decision_score            numeric       NOT NULL DEFAULT 0,
  estimated_revenue         numeric       NULL,
  estimated_time_minutes    int           NOT NULL DEFAULT 5,
  score_rationale           jsonb         NOT NULL DEFAULT '{}'::jsonb,
  scored_at                 timestamptz   NOT NULL DEFAULT now(),
  created_at                timestamptz   NOT NULL DEFAULT now(),
  updated_at                timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decision_scores_shop_id
  ON decision_scores (shop_id);
CREATE INDEX IF NOT EXISTS idx_decision_scores_recommendation_id
  ON decision_scores (recommendation_id);
CREATE INDEX IF NOT EXISTS idx_decision_scores_decision_score
  ON decision_scores (decision_score DESC);
CREATE INDEX IF NOT EXISTS idx_decision_scores_scored_at
  ON decision_scores (scored_at DESC);

ALTER TABLE decision_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "decision_scores_owner_manager" ON public.decision_scores
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM shop_users
      WHERE user_id = auth.uid()
        AND shop_id = decision_scores.shop_id
        AND role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shop_users
      WHERE user_id = auth.uid()
        AND shop_id = decision_scores.shop_id
        AND role IN ('owner', 'manager')
    )
  );

GRANT ALL ON TABLE decision_scores TO service_role, authenticated, anon;

-- ── decision_rankings ─────────────────────────────────────────
-- Stores the daily ranked action queue per shop.

CREATE TABLE IF NOT EXISTS public.decision_rankings (
  id                          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                     uuid          NOT NULL,
  ranking_date                date          NOT NULL,
  ranked_actions              jsonb         NOT NULL DEFAULT '[]'::jsonb,
  executive_score             numeric       NOT NULL DEFAULT 0,
  potential_revenue_today     numeric       NOT NULL DEFAULT 0,
  potential_cash_collection   numeric       NOT NULL DEFAULT 0,
  potential_jobs_closed       int           NOT NULL DEFAULT 0,
  potential_estimates_converted int         NOT NULL DEFAULT 0,
  potential_knowledge_added   int           NOT NULL DEFAULT 0,
  generated_at                timestamptz   NOT NULL DEFAULT now(),
  created_at                  timestamptz   NOT NULL DEFAULT now(),
  updated_at                  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decision_rankings_shop_date
  ON decision_rankings (shop_id, ranking_date DESC);

ALTER TABLE decision_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "decision_rankings_owner_manager" ON public.decision_rankings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM shop_users
      WHERE user_id = auth.uid()
        AND shop_id = decision_rankings.shop_id
        AND role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shop_users
      WHERE user_id = auth.uid()
        AND shop_id = decision_rankings.shop_id
        AND role IN ('owner', 'manager')
    )
  );

GRANT ALL ON TABLE decision_rankings TO service_role, authenticated, anon;

-- ── decision_history ──────────────────────────────────────────
-- Tracks past actions taken on ranked recommendations.

CREATE TABLE IF NOT EXISTS public.decision_history (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             uuid          NOT NULL,
  recommendation_id   uuid          NOT NULL,
  recommendation_key  text          NOT NULL,
  decision_score      numeric       NOT NULL DEFAULT 0,
  rank                int           NOT NULL DEFAULT 0,
  action_taken        text          NOT NULL,
  revenue_realized    numeric       NULL,
  acted_at            timestamptz   NOT NULL DEFAULT now(),
  created_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decision_history_shop_id
  ON decision_history (shop_id, acted_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_history_recommendation_id
  ON decision_history (recommendation_id);

ALTER TABLE decision_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "decision_history_owner_manager" ON public.decision_history
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM shop_users
      WHERE user_id = auth.uid()
        AND shop_id = decision_history.shop_id
        AND role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shop_users
      WHERE user_id = auth.uid()
        AND shop_id = decision_history.shop_id
        AND role IN ('owner', 'manager')
    )
  );

GRANT ALL ON TABLE decision_history TO service_role, authenticated, anon;

-- ── Feature flags ─────────────────────────────────────────────
INSERT INTO feature_flags (flag_key, enabled, description)
VALUES
  ('decision_engine',      false, 'SI-6: Executive Decision Engine scoring'),
  ('executive_dashboard',  false, 'SI-6: Executive Score dashboard panel'),
  ('action_queue',         false, 'SI-6: Today''s Action Queue (top 5)')
ON CONFLICT DO NOTHING;
