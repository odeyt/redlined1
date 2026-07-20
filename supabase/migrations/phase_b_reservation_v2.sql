-- Phase B Reservation v2: fix idempotency race condition
--
-- Problem: In v1 (phase_b_hardening.sql), the idempotency check ran BEFORE
-- pg_advisory_xact_lock. Two concurrent requests with the same idempotency_key
-- could both read "not found", then both attempt INSERT, triggering a unique
-- constraint violation on one of them.
--
-- Fix: Move the idempotency SELECT inside the advisory lock scope.
-- Advisory lock key uses bigint from hashtext XOR to avoid cross-metric/cross-tenant
-- collisions and stay within 64-bit space.

CREATE OR REPLACE FUNCTION reserve_usage(
  p_shop_id         uuid,
  p_metric          text,
  p_quantity        integer,
  p_limit           integer,    -- NULL = unlimited
  p_idempotency_key text,
  p_year_month      text        -- 'YYYY-MM'
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
  v_lock_key    bigint;
  v_existing_id uuid;
  v_new_id      uuid;
  v_used        integer;
  v_in_flight   integer;
BEGIN
  -- Unlimited: no concurrency risk, skip lock entirely
  IF p_limit IS NULL THEN
    INSERT INTO usage_reservations (shop_id, metric, quantity, idempotency_key)
    VALUES (p_shop_id, p_metric, p_quantity, p_idempotency_key)
    ON CONFLICT (idempotency_key) DO UPDATE
      SET idempotency_key = EXCLUDED.idempotency_key  -- no-op update to get the row
    RETURNING id INTO v_new_id;

    SELECT id INTO v_new_id FROM usage_reservations WHERE idempotency_key = p_idempotency_key LIMIT 1;
    RETURN QUERY SELECT v_new_id, FALSE, TRUE, 0::integer, 0::integer;
    RETURN;
  END IF;

  -- 64-bit lock key: XOR of shop_id hash and metric+month hash to avoid cross-tenant collisions
  v_lock_key := hashtext(p_shop_id::text)::bigint # hashtext(p_metric || ':' || p_year_month)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Idempotency check INSIDE the lock: prevents double-insert on concurrent retries
  SELECT id INTO v_existing_id
    FROM usage_reservations
   WHERE idempotency_key = p_idempotency_key
     AND released_at IS NULL
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_id, TRUE, TRUE, 0::integer, p_limit;
    RETURN;
  END IF;

  -- Count confirmed usage this month
  SELECT COALESCE(count, 0) INTO v_used
    FROM usage_monthly
   WHERE shop_id = p_shop_id
     AND year_month = p_year_month
     AND metric = p_metric;

  -- Count in-flight reservations (not yet completed or released, not expired)
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

-- ─── Stale reservation reconciliation ────────────────────────────────────────
-- Expire reservations that were never completed or released after 10 minutes.
-- Called by a scheduled job or a cron pg_cron entry; also called inline
-- by reserve_usage() passively via the expires_at filter above.
-- This function is safe to call repeatedly (idempotent).

CREATE OR REPLACE FUNCTION expire_stale_reservations()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE usage_reservations
     SET released_at = now()
   WHERE completed_at IS NULL
     AND released_at IS NULL
     AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
