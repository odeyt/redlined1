-- Phase B Hardening: atomic usage reservation
-- Prevents two simultaneous requests from both consuming the final available unit.

-- ─── usage_reservations table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS usage_reservations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id          uuid NOT NULL,
  metric           text NOT NULL,
  quantity         integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  idempotency_key  text NOT NULL,
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  completed_at     timestamptz,
  released_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS usage_reservations_idempotency_key_idx
  ON usage_reservations (idempotency_key);

CREATE INDEX IF NOT EXISTS usage_reservations_shop_metric_active_idx
  ON usage_reservations (shop_id, metric)
  WHERE completed_at IS NULL AND released_at IS NULL AND expires_at > now();

-- ─── reserve_usage() ──────────────────────────────────────────────────────────
-- Atomically checks the current limit and, if not exceeded, creates a reservation.
-- Returns: (reservation_id uuid, idempotent boolean, allowed boolean, used integer, limit_val integer)
--
-- Callers must:
--   1. Call reserve_usage() — if allowed=false, abort (limit reached).
--   2. Perform the action.
--   3. Call complete_reservation(reservation_id) on success.
--   4. Call release_reservation(reservation_id) on failure.

CREATE OR REPLACE FUNCTION reserve_usage(
  p_shop_id        uuid,
  p_metric         text,
  p_quantity       integer,
  p_limit          integer,   -- pass null for unlimited
  p_idempotency_key text,
  p_year_month     text       -- 'YYYY-MM'
)
RETURNS TABLE (
  reservation_id uuid,
  idempotent     boolean,
  allowed        boolean,
  used_count     integer,
  limit_val      integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_id uuid;
  v_new_id      uuid;
  v_used        integer;
  v_in_flight   integer;
BEGIN
  -- Idempotency: if the key was already reserved (and not released), return it
  SELECT id INTO v_existing_id
    FROM usage_reservations
   WHERE idempotency_key = p_idempotency_key
     AND released_at IS NULL
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_id, TRUE, TRUE, 0::integer, COALESCE(p_limit, 0);
    RETURN;
  END IF;

  -- Unlimited: skip counting and reserve immediately
  IF p_limit IS NULL THEN
    INSERT INTO usage_reservations (shop_id, metric, quantity, idempotency_key)
    VALUES (p_shop_id, p_metric, p_quantity, p_idempotency_key)
    RETURNING id INTO v_new_id;
    RETURN QUERY SELECT v_new_id, FALSE, TRUE, 0::integer, 0::integer;
    RETURN;
  END IF;

  -- Lock the usage_monthly row for this shop+metric to serialize concurrent requests
  PERFORM pg_advisory_xact_lock(hashtext(p_shop_id::text || p_metric || p_year_month));

  -- Count confirmed usage this month
  SELECT COALESCE(count, 0) INTO v_used
    FROM usage_monthly
   WHERE shop_id = p_shop_id
     AND year_month = p_year_month
     AND metric = p_metric;

  -- Count in-flight reservations (reserved but not yet completed or released)
  SELECT COALESCE(SUM(quantity), 0) INTO v_in_flight
    FROM usage_reservations
   WHERE shop_id = p_shop_id
     AND metric = p_metric
     AND completed_at IS NULL
     AND released_at IS NULL
     AND expires_at > now();

  IF (COALESCE(v_used, 0) + COALESCE(v_in_flight, 0) + p_quantity) > p_limit THEN
    RETURN QUERY SELECT NULL::uuid, FALSE, FALSE,
      (COALESCE(v_used, 0) + COALESCE(v_in_flight, 0))::integer, p_limit;
    RETURN;
  END IF;

  INSERT INTO usage_reservations (shop_id, metric, quantity, idempotency_key)
  VALUES (p_shop_id, p_metric, p_quantity, p_idempotency_key)
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT v_new_id, FALSE, TRUE,
    (COALESCE(v_used, 0) + COALESCE(v_in_flight, 0))::integer, p_limit;
END;
$$;

-- ─── complete_reservation() ───────────────────────────────────────────────────
-- Marks a reservation complete and atomically increments usage_monthly.

CREATE OR REPLACE FUNCTION complete_reservation(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_shop_id  uuid;
  v_metric   text;
  v_quantity integer;
  v_year_month text;
BEGIN
  UPDATE usage_reservations
     SET completed_at = now()
   WHERE id = p_reservation_id
     AND completed_at IS NULL
     AND released_at IS NULL
  RETURNING shop_id, metric, quantity INTO v_shop_id, v_metric, v_quantity;

  IF NOT FOUND THEN RETURN; END IF;

  v_year_month := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');

  INSERT INTO usage_monthly (shop_id, year_month, metric, count)
  VALUES (v_shop_id, v_year_month, v_metric, v_quantity)
  ON CONFLICT (shop_id, year_month, metric)
  DO UPDATE SET count = usage_monthly.count + v_quantity,
                updated_at = now();
END;
$$;

-- ─── release_reservation() ────────────────────────────────────────────────────
-- Releases an in-flight reservation (action failed or was aborted).

CREATE OR REPLACE FUNCTION release_reservation(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE usage_reservations
     SET released_at = now()
   WHERE id = p_reservation_id
     AND completed_at IS NULL
     AND released_at IS NULL;
END;
$$;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE usage_reservations ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write reservations
CREATE POLICY "service_role_only" ON usage_reservations
  USING (auth.role() = 'service_role');
