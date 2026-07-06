-- ============================================================
-- RedlineD1 — Automotive Knowledge Graph
-- Migration: automotive_knowledge_graph.sql
-- Sprint: 4 — Foundation Layer
-- Status: DESIGN ONLY — Do not run without review
-- Created: 2026-07-03
-- ============================================================
-- NOTE: Run this in Supabase SQL Editor after review.
-- All tables use IF NOT EXISTS for safety.
-- RLS is enabled on all tables.
-- ============================================================

-- ── 1. automotive_graph_nodes ─────────────────────────────────
-- Canonical named entities in the knowledge graph.
-- One node per unique entity (e.g. one node for "Toyota", one for "P0299").
-- Nodes with is_global=true and is_anonymized=true are network-readable.

CREATE TABLE IF NOT EXISTS public.automotive_graph_nodes (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id           uuid         REFERENCES public.shops(id) ON DELETE CASCADE,
  node_type         text         NOT NULL,
  canonical_name    text         NOT NULL,
  display_name      text         NOT NULL,
  normalized_key    text         NOT NULL,
  source_type       text,
  source_id         uuid,
  metadata          jsonb        NOT NULL DEFAULT '{}'::jsonb,
  confidence_score  numeric(5,4) NOT NULL DEFAULT 1.0,
  is_global         boolean      NOT NULL DEFAULT false,
  is_anonymized     boolean      NOT NULL DEFAULT true,
  created_by        uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.automotive_graph_nodes IS
  'Named entities in the Automotive Knowledge Graph (manufacturer, DTC, symptom, part, etc.)';

COMMENT ON COLUMN public.automotive_graph_nodes.normalized_key IS
  'Deterministic lowercase key used for upsert deduplication, e.g. "toyota|land_cruiser|p0299"';

COMMENT ON COLUMN public.automotive_graph_nodes.is_global IS
  'True only for nodes cleared for cross-shop reading. Requires is_anonymized=true.';

-- ── 2. automotive_graph_edges ─────────────────────────────────
-- Relationships between nodes, weighted by evidence.
-- edge_type is one of the defined GraphEdgeType values.
-- weight and evidence_count increase as more repair cases confirm the relationship.

CREATE TABLE IF NOT EXISTS public.automotive_graph_edges (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         uuid         REFERENCES public.shops(id) ON DELETE CASCADE,
  from_node_id    uuid         NOT NULL REFERENCES public.automotive_graph_nodes(id) ON DELETE CASCADE,
  to_node_id      uuid         NOT NULL REFERENCES public.automotive_graph_nodes(id) ON DELETE CASCADE,
  edge_type       text         NOT NULL,
  weight          numeric(8,4) NOT NULL DEFAULT 1.0,
  evidence_count  integer      NOT NULL DEFAULT 1,
  source_type     text,
  source_id       uuid,
  metadata        jsonb        NOT NULL DEFAULT '{}'::jsonb,
  is_global       boolean      NOT NULL DEFAULT false,
  is_anonymized   boolean      NOT NULL DEFAULT true,
  created_by      uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.automotive_graph_edges IS
  'Typed, weighted relationships between knowledge graph nodes';

COMMENT ON COLUMN public.automotive_graph_edges.weight IS
  'Derived from evidence_count, comeback rate, and technician agreement. Higher = more reliable.';

COMMENT ON COLUMN public.automotive_graph_edges.evidence_count IS
  'Number of distinct repair cases that have confirmed this edge relationship.';

-- ── 3. automotive_graph_observations ─────────────────────────
-- Raw evidence from real repair cases before graph extraction.
-- One row per measurable fact (DTC observed, test reading, part used, etc.).
-- The graph population service reads observations to create/strengthen edges.

CREATE TABLE IF NOT EXISTS public.automotive_graph_observations (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             uuid         NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  repair_case_id      uuid         REFERENCES public.repair_cases(id) ON DELETE SET NULL,
  repair_order_id     uuid         REFERENCES public.repair_orders(id) ON DELETE SET NULL,
  vehicle_id          uuid         REFERENCES public.vehicles(id) ON DELETE SET NULL,
  observation_type    text         NOT NULL,
  observation_value   text         NOT NULL,
  normalized_value    text,
  measurement_unit    text,
  measurement_numeric numeric(12,4),
  confidence_score    numeric(5,4) NOT NULL DEFAULT 1.0,
  technician_id       uuid,
  created_by          uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.automotive_graph_observations IS
  'Evidence records from real repair cases used to populate and strengthen graph edges';

COMMENT ON COLUMN public.automotive_graph_observations.observation_type IS
  'E.g. dtc_present, symptom_observed, test_performed, part_replaced, outcome_resolved';

COMMENT ON COLUMN public.automotive_graph_observations.normalized_value IS
  'Cleaned, uppercase, whitespace-trimmed version of observation_value for matching';

-- ── 4. automotive_graph_lessons ──────────────────────────────
-- Structured technician learnings extracted from repair cases.
-- More specific than a raw lesson_learned text field.
-- Powers the technician coaching feature.

CREATE TABLE IF NOT EXISTS public.automotive_graph_lessons (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id               uuid        NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  repair_case_id        uuid        REFERENCES public.repair_cases(id) ON DELETE SET NULL,
  title                 text        NOT NULL,
  problem               text,
  what_was_wrong        text,
  what_fooled_us        text,
  final_fix             text,
  check_first_next_time text,
  common_mistake        text,
  recommendation        text,
  tags                  text[]      NOT NULL DEFAULT '{}',
  confidence_score      numeric(5,4) NOT NULL DEFAULT 1.0,
  verified_status       text        NOT NULL DEFAULT 'pending',
  created_by            uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.automotive_graph_lessons IS
  'Structured lessons learned from repair cases for technician coaching';

COMMENT ON COLUMN public.automotive_graph_lessons.verified_status IS
  'pending | tech_verified | senior_verified | published';

-- ── 5. automotive_graph_metrics ──────────────────────────────
-- Aggregated performance statistics.
-- Recalculated on a schedule or on demand.
-- Used for dashboards, coaching, and confidence scoring.

CREATE TABLE IF NOT EXISTS public.automotive_graph_metrics (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         uuid         REFERENCES public.shops(id) ON DELETE CASCADE,
  metric_scope    text         NOT NULL,
  metric_key      text         NOT NULL,
  metric_value    numeric(12,4) NOT NULL,
  metadata        jsonb        NOT NULL DEFAULT '{}'::jsonb,
  calculated_at   timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.automotive_graph_metrics IS
  'Aggregated graph metrics: node counts, edge weights, technician stats, comeback rates';

COMMENT ON COLUMN public.automotive_graph_metrics.metric_scope IS
  'E.g. global, shop, technician, make_model, dtc';

-- ============================================================
-- INDEXES
-- ============================================================

-- automotive_graph_nodes
CREATE INDEX IF NOT EXISTS idx_agn_shop_id      ON public.automotive_graph_nodes (shop_id);
CREATE INDEX IF NOT EXISTS idx_agn_node_type    ON public.automotive_graph_nodes (node_type);
CREATE INDEX IF NOT EXISTS idx_agn_norm_key     ON public.automotive_graph_nodes (normalized_key);
CREATE INDEX IF NOT EXISTS idx_agn_is_global    ON public.automotive_graph_nodes (is_global) WHERE is_global = true;
CREATE INDEX IF NOT EXISTS idx_agn_source       ON public.automotive_graph_nodes (source_type, source_id);

-- automotive_graph_edges
CREATE INDEX IF NOT EXISTS idx_age_shop_id      ON public.automotive_graph_edges (shop_id);
CREATE INDEX IF NOT EXISTS idx_age_from_node    ON public.automotive_graph_edges (from_node_id);
CREATE INDEX IF NOT EXISTS idx_age_to_node      ON public.automotive_graph_edges (to_node_id);
CREATE INDEX IF NOT EXISTS idx_age_edge_type    ON public.automotive_graph_edges (edge_type);
CREATE INDEX IF NOT EXISTS idx_age_is_global    ON public.automotive_graph_edges (is_global) WHERE is_global = true;
CREATE INDEX IF NOT EXISTS idx_age_source       ON public.automotive_graph_edges (source_type, source_id);
-- Composite for graph traversal: "give me all edges of type X from node Y"
CREATE INDEX IF NOT EXISTS idx_age_from_type    ON public.automotive_graph_edges (from_node_id, edge_type);
CREATE INDEX IF NOT EXISTS idx_age_to_type      ON public.automotive_graph_edges (to_node_id, edge_type);

-- automotive_graph_observations
CREATE INDEX IF NOT EXISTS idx_ago_shop_id      ON public.automotive_graph_observations (shop_id);
CREATE INDEX IF NOT EXISTS idx_ago_case_id      ON public.automotive_graph_observations (repair_case_id);
CREATE INDEX IF NOT EXISTS idx_ago_vehicle_id   ON public.automotive_graph_observations (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_ago_obs_type     ON public.automotive_graph_observations (observation_type);
CREATE INDEX IF NOT EXISTS idx_ago_norm_value   ON public.automotive_graph_observations (normalized_value);

-- automotive_graph_lessons
CREATE INDEX IF NOT EXISTS idx_agl_shop_id      ON public.automotive_graph_lessons (shop_id);
CREATE INDEX IF NOT EXISTS idx_agl_case_id      ON public.automotive_graph_lessons (repair_case_id);
CREATE INDEX IF NOT EXISTS idx_agl_verified     ON public.automotive_graph_lessons (verified_status);

-- automotive_graph_metrics
CREATE INDEX IF NOT EXISTS idx_agm_shop_id      ON public.automotive_graph_metrics (shop_id);
CREATE INDEX IF NOT EXISTS idx_agm_scope_key    ON public.automotive_graph_metrics (metric_scope, metric_key);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.automotive_graph_nodes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automotive_graph_edges        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automotive_graph_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automotive_graph_lessons      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automotive_graph_metrics      ENABLE ROW LEVEL SECURITY;

-- ── automotive_graph_nodes RLS ────────────────────────────────

-- Read own shop's nodes
CREATE POLICY "nodes_shop_read" ON public.automotive_graph_nodes
  FOR SELECT USING (
    shop_id IS NOT NULL
    AND shop_id = ANY (public.my_shop_ids())
  );

-- Read global anonymized nodes (cross-shop knowledge)
CREATE POLICY "nodes_global_read" ON public.automotive_graph_nodes
  FOR SELECT USING (
    shop_id IS NULL
    AND is_global = true
    AND is_anonymized = true
  );

-- Write own shop's nodes
CREATE POLICY "nodes_shop_write" ON public.automotive_graph_nodes
  FOR ALL USING (
    shop_id IS NOT NULL
    AND shop_id = ANY (public.my_shop_ids())
  );

-- ── automotive_graph_edges RLS ────────────────────────────────

CREATE POLICY "edges_shop_read" ON public.automotive_graph_edges
  FOR SELECT USING (
    shop_id IS NOT NULL
    AND shop_id = ANY (public.my_shop_ids())
  );

CREATE POLICY "edges_global_read" ON public.automotive_graph_edges
  FOR SELECT USING (
    shop_id IS NULL
    AND is_global = true
    AND is_anonymized = true
  );

CREATE POLICY "edges_shop_write" ON public.automotive_graph_edges
  FOR ALL USING (
    shop_id IS NOT NULL
    AND shop_id = ANY (public.my_shop_ids())
  );

-- ── automotive_graph_observations RLS ────────────────────────

CREATE POLICY "observations_shop_read" ON public.automotive_graph_observations
  FOR SELECT USING (shop_id = ANY (public.my_shop_ids()));

CREATE POLICY "observations_shop_write" ON public.automotive_graph_observations
  FOR ALL USING (shop_id = ANY (public.my_shop_ids()));

-- ── automotive_graph_lessons RLS ─────────────────────────────

CREATE POLICY "lessons_shop_read" ON public.automotive_graph_lessons
  FOR SELECT USING (shop_id = ANY (public.my_shop_ids()));

CREATE POLICY "lessons_shop_write" ON public.automotive_graph_lessons
  FOR ALL USING (shop_id = ANY (public.my_shop_ids()));

-- ── automotive_graph_metrics RLS ─────────────────────────────

CREATE POLICY "metrics_shop_read" ON public.automotive_graph_metrics
  FOR SELECT USING (
    shop_id IS NULL
    OR shop_id = ANY (public.my_shop_ids())
  );

CREATE POLICY "metrics_shop_write" ON public.automotive_graph_metrics
  FOR ALL USING (
    shop_id IS NOT NULL
    AND shop_id = ANY (public.my_shop_ids())
  );

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_agn_updated_at
  BEFORE UPDATE ON public.automotive_graph_nodes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_age_updated_at
  BEFORE UPDATE ON public.automotive_graph_edges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_agl_updated_at
  BEFORE UPDATE ON public.automotive_graph_lessons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- UNIQUE INDEXES (Sprint 5 — required for upsert ON CONFLICT)
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS automotive_graph_nodes_unique_shop_node
ON public.automotive_graph_nodes (shop_id, node_type, normalized_key)
WHERE shop_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS automotive_graph_nodes_unique_global_node
ON public.automotive_graph_nodes (node_type, normalized_key)
WHERE is_global = true;

-- ============================================================
-- GRANTS (Sprint 5 — required; RLS alone is not enough)
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automotive_graph_nodes        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automotive_graph_edges        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automotive_graph_observations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automotive_graph_lessons      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automotive_graph_metrics      TO authenticated;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
-- Manual steps required after running:
-- 1. Verify public.my_shop_ids() function exists and works correctly
-- 2. Verify public.shops(id), public.repair_cases(id), public.repair_orders(id),
--    public.vehicles(id) all exist (they should)
-- 3. Test RLS with a shop-authenticated user before populating data
-- ============================================================
