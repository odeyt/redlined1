-- ═══════════════════════════════════════════════════════════════
-- SELF-LEARNING HISTORICAL LABOR GUIDE
-- Run in Supabase SQL Editor with Role: postgres
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.standard_labor_guides (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id              UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  make                 TEXT NOT NULL DEFAULT '*',
  model                TEXT NOT NULL DEFAULT '*',
  year                 INT,
  engine_type          TEXT,
  job_description_raw  TEXT NOT NULL,
  job_description_slug TEXT NOT NULL,
  suggested_hours      NUMERIC(5,2) NOT NULL,
  flat_rate_cost       NUMERIC(10,2) NOT NULL,
  labor_rate           NUMERIC(8,2) NOT NULL DEFAULT 145,
  times_performed      INT NOT NULL DEFAULT 1,
  source               TEXT NOT NULL DEFAULT 'historical',
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Unique: one baseline per shop + vehicle + normalized job
CREATE UNIQUE INDEX IF NOT EXISTS idx_slg_unique
  ON public.standard_labor_guides (shop_id, make, model, COALESCE(year::text, 'any'), job_description_slug);

CREATE INDEX IF NOT EXISTS idx_slg_slug ON public.standard_labor_guides (job_description_slug);
CREATE INDEX IF NOT EXISTS idx_slg_shop ON public.standard_labor_guides (shop_id);

-- Block all direct client access — served only via service-role API
ALTER TABLE public.standard_labor_guides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "slg_deny_all" ON public.standard_labor_guides;
CREATE POLICY "slg_deny_all" ON public.standard_labor_guides
  FOR ALL TO authenticated USING (false);

-- Verify
SELECT 'standard_labor_guides created' AS result;
