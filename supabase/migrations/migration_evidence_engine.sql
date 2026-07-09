-- SI-5: Evidence Engine Migration
-- Run in Supabase SQL Editor after SI-2 (migration_intelligence_bus.sql)
-- Creates: recommendation_evidence, recommendation_outcomes

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- TABLE: recommendation_evidence
-- Stores discrete evidence items that support a recommendation
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.recommendation_evidence (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             UUID NOT NULL,
  recommendation_id   UUID REFERENCES public.recommendations(id) ON DELETE CASCADE,
  evidence_type       TEXT NOT NULL,
  evidence_title      TEXT NOT NULL,
  evidence_value      TEXT NULL,
  evidence_numeric    NUMERIC NULL,
  source_entity_type  TEXT NULL,
  source_entity_id    UUID NULL,
  weight              NUMERIC DEFAULT 1,
  confidence          NUMERIC DEFAULT 0,
  metadata            JSONB DEFAULT '{}'::JSONB,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_evidence_shop_id        ON public.recommendation_evidence(shop_id);
CREATE INDEX IF NOT EXISTS idx_rec_evidence_rec_id         ON public.recommendation_evidence(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_rec_evidence_type           ON public.recommendation_evidence(evidence_type);
CREATE INDEX IF NOT EXISTS idx_rec_evidence_entity_type    ON public.recommendation_evidence(source_entity_type);

ALTER TABLE public.recommendation_evidence ENABLE ROW LEVEL SECURITY;

-- Owner and manager can read/write evidence for their shops
CREATE POLICY "rec_evidence_shop_owner_manager" ON public.recommendation_evidence
  FOR ALL TO authenticated
  USING (
    shop_id = ANY(public.my_shop_ids())
    AND EXISTS (
      SELECT 1 FROM public.shop_users su
      WHERE su.user_id = auth.uid()
        AND su.shop_id = recommendation_evidence.shop_id
        AND su.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    shop_id = ANY(public.my_shop_ids())
    AND EXISTS (
      SELECT 1 FROM public.shop_users su
      WHERE su.user_id = auth.uid()
        AND su.shop_id = recommendation_evidence.shop_id
        AND su.role IN ('owner', 'manager')
    )
  );

-- Service role (server-side) always allowed
CREATE POLICY "rec_evidence_service_role" ON public.recommendation_evidence
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- TABLE: recommendation_outcomes
-- Tracks what happened after a recommendation was shown
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.recommendation_outcomes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id           UUID NOT NULL,
  recommendation_id UUID REFERENCES public.recommendations(id) ON DELETE CASCADE,
  outcome_status    TEXT NOT NULL DEFAULT 'pending',
  outcome_value     NUMERIC NULL,
  revenue_realized  NUMERIC NULL,
  completed_by      UUID NULL,
  completed_at      TIMESTAMPTZ NULL,
  dismissed_by      UUID NULL,
  dismissed_at      TIMESTAMPTZ NULL,
  notes             TEXT NULL,
  metadata          JSONB DEFAULT '{}'::JSONB,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_outcomes_shop_id        ON public.recommendation_outcomes(shop_id);
CREATE INDEX IF NOT EXISTS idx_rec_outcomes_rec_id         ON public.recommendation_outcomes(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_rec_outcomes_status         ON public.recommendation_outcomes(outcome_status);

ALTER TABLE public.recommendation_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rec_outcomes_shop_owner_manager" ON public.recommendation_outcomes
  FOR ALL TO authenticated
  USING (
    shop_id = ANY(public.my_shop_ids())
    AND EXISTS (
      SELECT 1 FROM public.shop_users su
      WHERE su.user_id = auth.uid()
        AND su.shop_id = recommendation_outcomes.shop_id
        AND su.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    shop_id = ANY(public.my_shop_ids())
    AND EXISTS (
      SELECT 1 FROM public.shop_users su
      WHERE su.user_id = auth.uid()
        AND su.shop_id = recommendation_outcomes.shop_id
        AND su.role IN ('owner', 'manager')
    )
  );

CREATE POLICY "rec_outcomes_service_role" ON public.recommendation_outcomes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Grants ────────────────────────────────────────────────────
GRANT ALL ON TABLE shop_intelligence_metrics TO service_role, authenticated, anon;
GRANT ALL ON TABLE recommendation_evidence TO service_role, authenticated, anon;
GRANT ALL ON TABLE recommendation_outcomes TO service_role, authenticated, anon;
