-- =============================================================================
-- Redline Intelligence Bus — append-only event store
-- =============================================================================
-- Every event published to the bus is written here permanently.
-- Rows are NEVER updated or deleted — this is an immutable audit trail.
-- Future event replay reads directly from this table.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- rib_events — append-only event log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rib_events (
  -- Envelope (required on every event)
  event_id              UUID            PRIMARY KEY,
  event_type            TEXT            NOT NULL,
  timestamp             TIMESTAMPTZ     NOT NULL,
  organization_id       TEXT            NOT NULL,
  shop_id               UUID            NOT NULL,
  technician_id         UUID,
  vehicle_id            UUID,
  diagnostic_session_id UUID,
  correlation_id        TEXT            NOT NULL,
  schema_version        TEXT            NOT NULL DEFAULT '1.0',

  -- Full event payload (for replay)
  payload               JSONB           NOT NULL,

  -- Processing metadata
  processed_by          TEXT[]          NOT NULL DEFAULT '{}',
  handler_errors        JSONB,
  persisted_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Prevent updates and deletes — enforce immutability at DB level
CREATE OR REPLACE RULE rib_events_no_update AS ON UPDATE TO rib_events DO INSTEAD NOTHING;
CREATE OR REPLACE RULE rib_events_no_delete AS ON DELETE TO rib_events DO INSTEAD NOTHING;

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS rib_events_shop_id_idx        ON rib_events (shop_id);
CREATE INDEX IF NOT EXISTS rib_events_event_type_idx      ON rib_events (event_type);
CREATE INDEX IF NOT EXISTS rib_events_vehicle_id_idx      ON rib_events (vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rib_events_session_id_idx      ON rib_events (diagnostic_session_id) WHERE diagnostic_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rib_events_correlation_id_idx  ON rib_events (correlation_id);
CREATE INDEX IF NOT EXISTS rib_events_timestamp_idx       ON rib_events (timestamp DESC);
CREATE INDEX IF NOT EXISTS rib_events_technician_id_idx   ON rib_events (technician_id) WHERE technician_id IS NOT NULL;

-- Row-level security
ALTER TABLE rib_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop members can read their own rib_events" ON rib_events;
CREATE POLICY "shop members can read their own rib_events"
  ON rib_events FOR SELECT
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- INSERT allowed for authenticated users (publish path enforces shop_id)
DROP POLICY IF EXISTS "authenticated users can insert rib_events" ON rib_events;
CREATE POLICY "authenticated users can insert rib_events"
  ON rib_events FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- rib_subscriptions — registry of active subscribers (for observability)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rib_subscriptions (
  subscriber_id       TEXT            NOT NULL,
  shop_id             UUID            NOT NULL,
  display_name        TEXT            NOT NULL,
  subscribed_events   TEXT[]          NOT NULL DEFAULT '{}',
  is_enabled          BOOLEAN         NOT NULL DEFAULT TRUE,
  registered_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  last_processed_at   TIMESTAMPTZ,
  processed_count     BIGINT          NOT NULL DEFAULT 0,
  error_count         BIGINT          NOT NULL DEFAULT 0,
  PRIMARY KEY (subscriber_id, shop_id)
);

ALTER TABLE rib_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop members can read rib_subscriptions" ON rib_subscriptions;
CREATE POLICY "shop members can read rib_subscriptions"
  ON rib_subscriptions FOR SELECT
  USING (shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Feature flag seed — bus is OFF by default
-- ---------------------------------------------------------------------------

INSERT INTO feature_flags (flag_key, display_name, description, enabled, scope)
VALUES
  ('intelligence_bus', 'Redline Intelligence Bus', 'Event-driven intelligence backbone — all modules communicate through the bus', false, 'global')
ON CONFLICT (flag_key) DO NOTHING;
