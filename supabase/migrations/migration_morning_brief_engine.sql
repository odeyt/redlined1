-- SI-7: Morning Brief Engine
-- Deterministic daily CEO briefing. No AI. No external calls. Fail-safe.

-- ── morning_briefs ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.morning_briefs (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id               uuid          NOT NULL,
  brief_date            date          NOT NULL DEFAULT current_date,
  status                text          NOT NULL DEFAULT 'draft',
  shop_health_score     integer       DEFAULT 100,
  executive_score       integer       DEFAULT 100,
  title                 text,
  summary               text,
  yesterday_summary     jsonb         NOT NULL DEFAULT '{}'::jsonb,
  today_priorities      jsonb         NOT NULL DEFAULT '[]'::jsonb,
  revenue_opportunities jsonb         NOT NULL DEFAULT '[]'::jsonb,
  cash_collection       jsonb         NOT NULL DEFAULT '{}'::jsonb,
  operational_risks     jsonb         NOT NULL DEFAULT '[]'::jsonb,
  technician_summary    jsonb         NOT NULL DEFAULT '{}'::jsonb,
  inventory_summary     jsonb         NOT NULL DEFAULT '{}'::jsonb,
  recommended_focus     text,
  metadata              jsonb         NOT NULL DEFAULT '{}'::jsonb,
  generated_at          timestamptz   DEFAULT now(),
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_morning_briefs_shop_date
  ON morning_briefs (shop_id, brief_date);

CREATE INDEX IF NOT EXISTS idx_morning_briefs_shop_id
  ON morning_briefs (shop_id);

CREATE INDEX IF NOT EXISTS idx_morning_briefs_brief_date
  ON morning_briefs (brief_date DESC);

CREATE INDEX IF NOT EXISTS idx_morning_briefs_status
  ON morning_briefs (status);

ALTER TABLE morning_briefs ENABLE ROW LEVEL SECURITY;

-- Owners and managers can read their own shop's briefs
CREATE POLICY "morning_briefs_read" ON public.morning_briefs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM shop_users
      WHERE user_id = auth.uid()
        AND shop_id = morning_briefs.shop_id
        AND role IN ('owner', 'manager')
    )
  );

-- Owners and managers can update status (dismiss/archive)
CREATE POLICY "morning_briefs_update_status" ON public.morning_briefs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM shop_users
      WHERE user_id = auth.uid()
        AND shop_id = morning_briefs.shop_id
        AND role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shop_users
      WHERE user_id = auth.uid()
        AND shop_id = morning_briefs.shop_id
        AND role IN ('owner', 'manager')
    )
  );

-- Service role can insert/update freely (bypasses RLS)
GRANT ALL ON TABLE morning_briefs TO service_role, authenticated, anon;

-- ── brief_delivery_logs ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.brief_delivery_logs (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             uuid          NOT NULL,
  morning_brief_id    uuid          REFERENCES morning_briefs(id) ON DELETE CASCADE,
  delivery_channel    text          NOT NULL,
  recipient_user_id   uuid          NULL,
  recipient_email     text          NULL,
  status              text          NOT NULL DEFAULT 'pending',
  sent_at             timestamptz   NULL,
  error               text          NULL,
  metadata            jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brief_delivery_logs_shop_id
  ON brief_delivery_logs (shop_id);

CREATE INDEX IF NOT EXISTS idx_brief_delivery_logs_brief_id
  ON brief_delivery_logs (morning_brief_id);

CREATE INDEX IF NOT EXISTS idx_brief_delivery_logs_status
  ON brief_delivery_logs (status);

ALTER TABLE brief_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brief_delivery_logs_read" ON public.brief_delivery_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM shop_users
      WHERE user_id = auth.uid()
        AND shop_id = brief_delivery_logs.shop_id
        AND role IN ('owner', 'manager')
    )
  );

GRANT ALL ON TABLE brief_delivery_logs TO service_role, authenticated, anon;

-- ── Feature flags (default OFF) ───────────────────────────────
INSERT INTO feature_flags (flag_key, enabled, description)
VALUES
  ('morning_brief_engine',   false, 'SI-7: Morning Brief Engine — generate daily brief'),
  ('morning_brief_dashboard', false, 'SI-7: Morning Brief — show panel in Command Center'),
  ('morning_brief_delivery',  false, 'SI-7: Morning Brief — delivery infrastructure (dashboard only for now)')
ON CONFLICT DO NOTHING;
