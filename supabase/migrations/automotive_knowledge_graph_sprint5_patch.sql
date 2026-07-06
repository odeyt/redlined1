-- ============================================================
-- Automotive Knowledge Graph — Sprint 5 Patch
-- Run this in Supabase SQL Editor (redlined1 project).
-- Safe to run multiple times.
-- ============================================================

-- ── STEP 1: Unique index for upsert deduplication ──────────
-- Required for ON CONFLICT (shop_id, node_type, normalized_key).
-- Same normalized_key can exist across different node_types,
-- so all three columns are needed to guarantee uniqueness.

CREATE UNIQUE INDEX IF NOT EXISTS automotive_graph_nodes_unique_shop_node
ON public.automotive_graph_nodes (shop_id, node_type, normalized_key)
WHERE shop_id IS NOT NULL;

-- Global nodes (is_global = true, shop_id IS NULL) have no shop scope.
-- Same global entity (e.g. DTC code) should not duplicate across type + key.
CREATE UNIQUE INDEX IF NOT EXISTS automotive_graph_nodes_unique_global_node
ON public.automotive_graph_nodes (node_type, normalized_key)
WHERE is_global = true;

-- ── STEP 2: Grants for authenticated role ──────────────────
-- RLS policies are not enough — PostgreSQL requires explicit
-- table-level GRANT before RLS is even evaluated.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automotive_graph_nodes        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automotive_graph_edges        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automotive_graph_observations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automotive_graph_lessons      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automotive_graph_metrics      TO authenticated;
