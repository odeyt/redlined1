-- ============================================================
-- Free Forever caps: make them race-safe.
--
-- free_tier_usage_limits.sql counts and then inserts. Two requests arriving
-- together for a shop with 9/10 customers both count 9, both pass, and the
-- shop ends at 11. Same for vehicles (10) and job cards (5 per month).
--
-- Fix: for free shops only, take a transaction-scoped advisory lock keyed on
-- (table, shop) BEFORE counting. A second writer waits until the first
-- transaction commits, then counts (a fresh snapshot per statement under
-- READ COMMITTED, which PostgREST uses) and sees the committed row. Paid
-- shops and shops with no owner profile return before the lock, so they pay
-- nothing. Locks are per table, so customer inserts never wait on job cards.
--
-- Scope: this replaces ONLY the function body. Limits (10/10/5), the plan
-- lookup, the error message ('FREE_TIER_LIMIT:<table>:<limit>') and the three
-- existing triggers are unchanged; the triggers are not touched. No data is
-- read or modified. Rollback: re-run the CREATE OR REPLACE FUNCTION from
-- free_tier_usage_limits.sql.
--
-- Note: CREATE OR REPLACE overwrites whatever body production has. Compare
-- pg_get_functiondef('public.enforce_free_tier_count_limit'::regproc) with
-- free_tier_usage_limits.sql on staging first, in case it was edited by hand.
--
-- One transaction: a failure leaves the old function in place.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_free_tier_count_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_key text;
  v_count    integer;
  v_limit    integer;
BEGIN
  SELECT p.plan INTO v_plan_key
  FROM public.shop_users su
  JOIN public.profiles p ON p.id = su.user_id
  WHERE su.shop_id = NEW.shop_id AND su.role = 'owner'
  LIMIT 1;

  -- Not on the free plan (paid, or no owner profile found) — never limited here.
  IF v_plan_key IS DISTINCT FROM 'free' THEN
    RETURN NEW;
  END IF;

  -- Serialise free-shop inserts per (table, shop); held until commit/rollback.
  PERFORM pg_advisory_xact_lock(hashtext('free_tier.' || TG_TABLE_NAME),
                                hashtext(NEW.shop_id::text));

  IF TG_TABLE_NAME = 'customers' THEN
    v_limit := 10;
    SELECT count(*) INTO v_count FROM public.customers WHERE shop_id = NEW.shop_id;
  ELSIF TG_TABLE_NAME = 'vehicles' THEN
    v_limit := 10;
    SELECT count(*) INTO v_count FROM public.vehicles WHERE shop_id = NEW.shop_id;
  ELSIF TG_TABLE_NAME = 'job_cards' THEN
    v_limit := 5;
    -- job_cards has no created_at column; check_in_date is set at creation
    -- time in services/jobCardService.ts and is the closest equivalent.
    SELECT count(*) INTO v_count
    FROM public.job_cards
    WHERE shop_id = NEW.shop_id
      AND check_in_date >= date_trunc('month', now());
  ELSE
    RETURN NEW;
  END IF;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'FREE_TIER_LIMIT:%:%', TG_TABLE_NAME, v_limit
      USING ERRCODE = 'P0001',
            HINT = 'Upgrade your plan to add more.';
  END IF;

  RETURN NEW;
END;
$$;

-- Read-only check: the installed function now takes the lock.
DO $$
BEGIN
  IF pg_get_functiondef('public.enforce_free_tier_count_limit'::regproc)
       NOT LIKE '%pg_advisory_xact_lock%' THEN
    RAISE EXCEPTION 'free-tier cap function is missing the advisory lock';
  END IF;
END $$;

COMMIT;
