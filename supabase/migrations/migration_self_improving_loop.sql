-- ─────────────────────────────────────────────────────────────────────────────
-- RedlineD1 Self-Improving Loop — Audit and Learning Tables
-- Every learning signal is immutable — never updated or deleted.
-- Full audit history is preserved indefinitely.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── rd1_learning_events (immutable audit log of all feedback signals) ─────────
CREATE TABLE IF NOT EXISTS rd1_learning_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type     text        NOT NULL,
  shop_id         uuid        NOT NULL,
  target_id       uuid        NOT NULL,
  target_type     text        NOT NULL,
  delta           integer     NOT NULL,       -- confidence change applied
  vehicle_id      uuid,
  technician_id   uuid,
  notes           text,
  occurred_at     timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Immutable — no UPDATE or DELETE allowed
CREATE INDEX IF NOT EXISTS idx_learning_events_shop   ON rd1_learning_events(shop_id);
CREATE INDEX IF NOT EXISTS idx_learning_events_target ON rd1_learning_events(target_id);
CREATE INDEX IF NOT EXISTS idx_learning_events_type   ON rd1_learning_events(signal_type);
CREATE INDEX IF NOT EXISTS idx_learning_events_when   ON rd1_learning_events(occurred_at);

ALTER TABLE rd1_learning_events ENABLE ROW LEVEL SECURITY;

-- Only owners and managers can read learning events
CREATE POLICY IF NOT EXISTS "learning_events_owner_manager"
  ON rd1_learning_events FOR SELECT
  USING (shop_id IN (
    SELECT shop_id FROM shop_users WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
  ));

-- Service role can insert (from API routes / background jobs)
CREATE POLICY IF NOT EXISTS "learning_events_insert_all"
  ON rd1_learning_events FOR INSERT WITH CHECK (true);

-- ── rd1_insight_outcomes (tracks whether insights led to positive outcomes) ────
CREATE TABLE IF NOT EXISTS rd1_insight_outcomes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_id      text        NOT NULL,
  signal_type     text        NOT NULL,
  was_positive    boolean     NOT NULL,
  occurred_at     timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insight_outcomes_insight  ON rd1_insight_outcomes(insight_id);
CREATE INDEX IF NOT EXISTS idx_insight_outcomes_positive ON rd1_insight_outcomes(was_positive);

ALTER TABLE rd1_insight_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "insight_outcomes_insert_all"
  ON rd1_insight_outcomes FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "insight_outcomes_select_all"
  ON rd1_insight_outcomes FOR SELECT USING (true);

-- ── Protect immutability — no UPDATE or DELETE on learning_events ─────────────
-- (enforced at application level; RLS doesn't natively block UPDATE per row but
--  service role bypass is the only write path and is locked to INSERT only via code)
