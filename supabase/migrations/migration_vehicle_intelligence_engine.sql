-- SI-10: Vehicle Intelligence Engine
-- Additive tables only. No existing tables modified.
-- All flags default OFF. Production workflows unchanged.

-- ── Tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vehicle_intelligence_profiles (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                   uuid        NOT NULL,
  vehicle_id                uuid        NOT NULL,
  health_score              integer,
  intelligence_status       text        NOT NULL DEFAULT 'limited',
  visit_count               integer     NOT NULL DEFAULT 0,
  completed_repair_count    integer     NOT NULL DEFAULT 0,
  repair_case_count         integer     NOT NULL DEFAULT 0,
  open_estimate_count       integer     NOT NULL DEFAULT 0,
  declined_estimate_count   integer     NOT NULL DEFAULT 0,
  unpaid_invoice_count      integer     NOT NULL DEFAULT 0,
  comeback_count            integer     NOT NULL DEFAULT 0,
  warranty_count            integer     NOT NULL DEFAULT 0,
  total_revenue             numeric     NOT NULL DEFAULT 0,
  average_invoice_value     numeric     NOT NULL DEFAULT 0,
  last_visit_at             timestamptz,
  last_completed_repair_at  timestamptz,
  latest_mileage            numeric,
  common_concerns           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  common_dtcs               jsonb       NOT NULL DEFAULT '[]'::jsonb,
  common_repairs            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  common_parts              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  declined_work             jsonb       NOT NULL DEFAULT '[]'::jsonb,
  repair_lessons            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  risk_signals              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  recommended_checks        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  metadata                  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  calculated_at             timestamptz NOT NULL DEFAULT now(),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, vehicle_id)
);

CREATE TABLE IF NOT EXISTS vehicle_intelligence_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      uuid        NOT NULL,
  vehicle_id   uuid        NOT NULL,
  event_type   text        NOT NULL,
  source_type  text,
  source_id    uuid,
  event_date   timestamptz NOT NULL DEFAULT now(),
  summary      text,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicle_intelligence_signals (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      uuid        NOT NULL,
  vehicle_id   uuid        NOT NULL,
  signal_key   text        NOT NULL,
  signal_type  text        NOT NULL,
  severity     text        NOT NULL DEFAULT 'info',
  title        text        NOT NULL,
  description  text,
  confidence   numeric     NOT NULL DEFAULT 0,
  source_type  text,
  source_id    uuid,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_vip_shop_id       ON vehicle_intelligence_profiles(shop_id);
CREATE INDEX IF NOT EXISTS idx_vip_vehicle_id    ON vehicle_intelligence_profiles(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vip_health_score  ON vehicle_intelligence_profiles(health_score);
CREATE INDEX IF NOT EXISTS idx_vip_calculated_at ON vehicle_intelligence_profiles(calculated_at);

CREATE INDEX IF NOT EXISTS idx_vie_shop_id     ON vehicle_intelligence_events(shop_id);
CREATE INDEX IF NOT EXISTS idx_vie_vehicle_id  ON vehicle_intelligence_events(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vie_event_type  ON vehicle_intelligence_events(event_type);

CREATE INDEX IF NOT EXISTS idx_vis_shop_id    ON vehicle_intelligence_signals(shop_id);
CREATE INDEX IF NOT EXISTS idx_vis_vehicle_id ON vehicle_intelligence_signals(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vis_signal_key ON vehicle_intelligence_signals(signal_key);
CREATE INDEX IF NOT EXISTS idx_vis_severity   ON vehicle_intelligence_signals(severity);
CREATE INDEX IF NOT EXISTS idx_vis_is_active  ON vehicle_intelligence_signals(is_active);

-- ── RLS ───────────────────────────────────────────────────────

ALTER TABLE vehicle_intelligence_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_intelligence_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_intelligence_signals  ENABLE ROW LEVEL SECURITY;

-- Owner/manager/service advisor: read their shop's vehicle intelligence
CREATE POLICY "staff_read_vehicle_profiles" ON vehicle_intelligence_profiles
  FOR SELECT USING (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'service_advisor')
    )
  );

-- Technician: read vehicle intelligence (matches vehicle read access)
CREATE POLICY "technician_read_vehicle_profiles" ON vehicle_intelligence_profiles
  FOR SELECT USING (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid() AND role = 'technician'
    )
  );

-- Staff read signals
CREATE POLICY "staff_read_vehicle_signals" ON vehicle_intelligence_signals
  FOR SELECT USING (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'service_advisor', 'technician')
    )
  );

-- Staff read events
CREATE POLICY "staff_read_vehicle_events" ON vehicle_intelligence_events
  FOR SELECT USING (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'service_advisor', 'technician')
    )
  );

-- Service role: full access for background extraction
GRANT ALL ON vehicle_intelligence_profiles TO service_role;
GRANT ALL ON vehicle_intelligence_events   TO service_role;
GRANT ALL ON vehicle_intelligence_signals  TO service_role;

-- ── Feature Flags ─────────────────────────────────────────────

INSERT INTO feature_flags (flag_key, enabled, description)
VALUES
  ('vehicle_intelligence_engine',         false, 'SI-10: Enable vehicle intelligence extraction and scoring'),
  ('vehicle_intelligence_panel',          false, 'SI-10: Show Vehicle Intelligence panel on vehicle detail page'),
  ('vehicle_intelligence_command_center', false, 'SI-10: Show vehicle intelligence alerts in Command Center'),
  ('vehicle_intelligence_auto_refresh',   false, 'SI-10: Auto-refresh vehicle intelligence on operational events')
ON CONFLICT DO NOTHING;
