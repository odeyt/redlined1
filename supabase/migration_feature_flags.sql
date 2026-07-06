-- ─────────────────────────────────────────────────────────────────────────────
-- Redlined1 — Feature Flag System Migration
-- Safe to run: all statements use IF NOT EXISTS / OR REPLACE
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. feature_flags table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  flag_key      text        NOT NULL,
  display_name  text        NOT NULL DEFAULT '',
  description   text        NOT NULL DEFAULT '',

  -- State
  enabled       boolean     NOT NULL DEFAULT false,

  -- Scope: 'global' | 'shop' | 'role' | 'user' | 'environment'
  scope         text        NOT NULL DEFAULT 'global',

  -- Scope targets (null when not applicable)
  shop_id       uuid,
  user_id       uuid,
  role          text,        -- 'owner' | 'manager' | 'technician' | 'advisor'
  environment   text,        -- 'production' | 'staging' | 'development'

  -- Audit
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one row per (flag_key + scope combination)
-- Allows: one global row + one per shop + one per role + one per user + one per env
CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_unique_scope
  ON public.feature_flags (
    flag_key,
    scope,
    COALESCE(shop_id::text,    ''),
    COALESCE(user_id::text,    ''),
    COALESCE(role,             ''),
    COALESCE(environment,      '')
  );

CREATE INDEX IF NOT EXISTS feature_flags_key_idx
  ON public.feature_flags (flag_key);

CREATE INDEX IF NOT EXISTS feature_flags_shop_idx
  ON public.feature_flags (shop_id) WHERE shop_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS feature_flags_user_idx
  ON public.feature_flags (user_id) WHERE user_id IS NOT NULL;

-- ── 2. updated_at trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_feature_flags_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feature_flags_updated_at ON public.feature_flags;
CREATE TRIGGER feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE PROCEDURE public.set_feature_flags_updated_at();

-- ── 3. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read global + shop-scoped + role-scoped flags
DROP POLICY IF EXISTS "feature_flags_read_authenticated" ON public.feature_flags;
CREATE POLICY "feature_flags_read_authenticated"
  ON public.feature_flags FOR SELECT
  USING (auth.role() = 'authenticated');

-- Service role can write (API routes use service key)
DROP POLICY IF EXISTS "feature_flags_service_write" ON public.feature_flags;
CREATE POLICY "feature_flags_service_write"
  ON public.feature_flags FOR ALL
  USING (auth.role() = 'service_role');

-- ── 4. Seed: initial flags (all disabled by default) ─────────────────────────

INSERT INTO public.feature_flags (flag_key, display_name, description, enabled, scope)
VALUES
  ('smart_intake',         'Smart Intake',           'AI-guided complaint capture in job cards',                          false, 'global'),
  ('ai_estimates',         'AI Estimates',           'Generate labor & parts estimates using AI',                         false, 'global'),
  ('ai_service_advisor',   'AI Service Advisor',     'Suggest repair recommendations to service advisors',                false, 'global'),
  ('knowledge_graph',      'Knowledge Graph',        'Automotive knowledge graph for repair pattern analysis',            false, 'global'),
  ('similar_repairs',      'Similar Repairs',        'Show similar past repairs on job cards',                            false, 'global'),
  ('ai_second_opinion',    'AI Second Opinion',      'AI cross-checks technician diagnosis before finalizing estimates',  false, 'global'),
  ('voice_notes',          'Voice Notes',            'Record voice notes on job cards and inspections',                   false, 'global'),
  ('owner_dashboard_v2',   'Owner Dashboard v2',     'Redesigned owner dashboard with KPI tiles',                         false, 'global'),
  ('mobile_beta',          'Mobile Beta',            'Enables mobile-optimized layouts for shop floor tablets',           false, 'global'),
  ('plugin_system',        'Plugin System',          'Third-party plugin marketplace and webhook integrations',           false, 'global')
ON CONFLICT DO NOTHING;
