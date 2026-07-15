-- =============================================================================
-- RIB Hardening Migration — additive changes only
-- Applies on top of migration_rib.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add causality envelope columns to rib_events
-- ---------------------------------------------------------------------------

ALTER TABLE rib_events
  ADD COLUMN IF NOT EXISTS occurred_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS causation_id     UUID,
  ADD COLUMN IF NOT EXISTS origin_module    TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS event_depth      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill occurred_at from timestamp for existing rows
UPDATE rib_events SET occurred_at = timestamp WHERE occurred_at IS NULL;

-- Index for causation chain traversal
CREATE INDEX IF NOT EXISTS rib_events_causation_id_idx ON rib_events (causation_id) WHERE causation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rib_events_occurred_at_idx  ON rib_events (occurred_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Replace silent DO INSTEAD NOTHING rules with error-raising triggers
--    DO INSTEAD NOTHING lets callers think the operation succeeded — wrong.
--    A trigger that raises an exception makes the error visible and testable.
-- ---------------------------------------------------------------------------

DROP RULE IF EXISTS rib_events_no_update ON rib_events;
DROP RULE IF EXISTS rib_events_no_delete ON rib_events;

CREATE OR REPLACE FUNCTION rib_events_enforce_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rib_events is immutable — updates and deletes are not permitted (event_id: %)', OLD.event_id;
END;
$$;

DROP TRIGGER IF EXISTS rib_events_block_update ON rib_events;
CREATE TRIGGER rib_events_block_update
  BEFORE UPDATE ON rib_events
  FOR EACH ROW EXECUTE FUNCTION rib_events_enforce_immutable();

DROP TRIGGER IF EXISTS rib_events_block_delete ON rib_events;
CREATE TRIGGER rib_events_block_delete
  BEFORE DELETE ON rib_events
  FOR EACH ROW EXECUTE FUNCTION rib_events_enforce_immutable();

-- ---------------------------------------------------------------------------
-- 3. Tighten INSERT RLS — require authenticated user to belong to the shop
--    Original policy allowed any authenticated user to insert for any shop.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "authenticated users can insert rib_events" ON rib_events;

CREATE POLICY "shop members can insert their own rib_events"
  ON rib_events FOR INSERT
  WITH CHECK (
    shop_id IN (SELECT shop_id FROM shop_users WHERE user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 4. rib_event_deliveries — idempotent handler tracking
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rib_event_deliveries (
  id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID            NOT NULL,
  organization_id     UUID            NOT NULL,
  handler_name        TEXT            NOT NULL,
  handler_version     TEXT            NOT NULL DEFAULT '1',
  status              TEXT            NOT NULL DEFAULT 'processing',
  attempt_count       INTEGER         NOT NULL DEFAULT 1,

  -- Composite idempotency key: eventId + handlerName + handlerVersion
  idempotency_key     TEXT            NOT NULL,

  first_attempted_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  last_attempted_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  next_retry_at       TIMESTAMPTZ,

  error_code          TEXT,
  error_message       TEXT,

  -- For replay-triggered deliveries
  replay_id           UUID,

  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT rib_event_deliveries_status_check
    CHECK (status IN ('processing', 'completed', 'failed', 'retry_scheduled', 'dead_lettered', 'skipped')),

  -- Prevent duplicate handler execution for the same (event, handler, version) triplet
  CONSTRAINT rib_event_deliveries_idempotency_key_unique UNIQUE (idempotency_key)
);

-- Indexes for common access patterns
CREATE INDEX IF NOT EXISTS rib_del_event_id_idx       ON rib_event_deliveries (event_id);
CREATE INDEX IF NOT EXISTS rib_del_org_id_idx         ON rib_event_deliveries (organization_id);
CREATE INDEX IF NOT EXISTS rib_del_status_idx         ON rib_event_deliveries (status) WHERE status IN ('failed', 'retry_scheduled', 'processing');
CREATE INDEX IF NOT EXISTS rib_del_replay_id_idx      ON rib_event_deliveries (replay_id) WHERE replay_id IS NOT NULL;

-- Row-level security
ALTER TABLE rib_event_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "org members can read their deliveries"
  ON rib_event_deliveries FOR SELECT
  USING (
    organization_id IN (
      SELECT DISTINCT su.shop_id::uuid
      FROM shop_users su
      WHERE su.user_id = auth.uid()
    )
  );

-- Service role has full access for handler tracking
CREATE POLICY IF NOT EXISTS "service role can manage deliveries"
  ON rib_event_deliveries FOR ALL
  USING (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 5. Auto-update updated_at on rib_event_deliveries
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rib_event_deliveries_updated_at ON rib_event_deliveries;
CREATE TRIGGER rib_event_deliveries_updated_at
  BEFORE UPDATE ON rib_event_deliveries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
