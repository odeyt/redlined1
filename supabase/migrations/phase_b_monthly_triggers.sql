-- Phase B Monthly Triggers: server-enforced monthly metric limits for Free plan
--
-- BEFORE INSERT triggers on appointments, inspections (DVI), and closed_jobs.
-- These fire for all insertion paths (browser client, service role, etc.).
--
-- Free plan monthly limits enforced here:
--   appointments  <= 5  per calendar month
--   dvi           <= 2  per calendar month (inspections table)
--   completed_jobs<= 5  per calendar month (closed_jobs table)
--
-- Idempotency for completed_jobs: each job is identified by its id column.
-- Re-closing a job that was previously closed (same id) does NOT count as a
-- new usage unit — checked via usage_reservations or by catching ON CONFLICT.
--
-- ai_cases, vin_lookups are enforced via atomic reservation in API routes.
-- sms is not limited on Free (unlimited mock; no SMS provider wired).

-- ─── Shared: current year-month string ────────────────────────────────────────

CREATE OR REPLACE FUNCTION _current_year_month()
RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
$$;

-- ─── Shared: get monthly count for a shop+metric ──────────────────────────────

CREATE OR REPLACE FUNCTION _get_monthly_count(p_shop_id uuid, p_metric text, p_year_month text)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT count FROM public.usage_monthly
      WHERE shop_id = p_shop_id
        AND year_month = p_year_month
        AND metric = p_metric),
    0
  );
$$;

-- ─── Shared: monthly limit for Free plan ──────────────────────────────────────

CREATE OR REPLACE FUNCTION _free_monthly_limit(p_metric text)
RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_metric
    WHEN 'appointments'   THEN 5
    WHEN 'dvi'            THEN 2
    WHEN 'completed_jobs' THEN 5
    ELSE NULL
  END;
$$;

-- ─── Appointments limit trigger ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION enforce_appointments_monthly_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_plan       text;
  v_year_month text;
  v_limit      integer;
  v_used       integer;
BEGIN
  IF _is_d1_internal_shop(NEW.shop_id) THEN
    RETURN NEW;
  END IF;

  v_plan := _get_shop_plan(NEW.shop_id);
  IF v_plan <> 'free' THEN RETURN NEW; END IF;

  v_year_month := _current_year_month();
  v_limit      := _free_monthly_limit('appointments');
  v_used       := _get_monthly_count(NEW.shop_id, 'appointments', v_year_month);

  IF v_used >= v_limit THEN
    RAISE EXCEPTION 'LIMIT_EXCEEDED:appointments:%:%', v_used, v_limit
      USING ERRCODE = 'P0001';
  END IF;

  -- Increment the monthly counter atomically
  INSERT INTO public.usage_monthly (shop_id, year_month, metric, count)
  VALUES (NEW.shop_id, v_year_month, 'appointments', 1)
  ON CONFLICT (shop_id, year_month, metric)
  DO UPDATE SET count = public.usage_monthly.count + 1, updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_appointments_limit ON public.appointments;
CREATE TRIGGER trg_enforce_appointments_limit
  BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION enforce_appointments_monthly_limit();

-- ─── DVI (inspections) limit trigger ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION enforce_dvi_monthly_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_plan       text;
  v_year_month text;
  v_limit      integer;
  v_used       integer;
BEGIN
  IF _is_d1_internal_shop(NEW.shop_id) THEN
    RETURN NEW;
  END IF;

  v_plan := _get_shop_plan(NEW.shop_id);
  IF v_plan <> 'free' THEN RETURN NEW; END IF;

  v_year_month := _current_year_month();
  v_limit      := _free_monthly_limit('dvi');
  v_used       := _get_monthly_count(NEW.shop_id, 'dvi', v_year_month);

  IF v_used >= v_limit THEN
    RAISE EXCEPTION 'LIMIT_EXCEEDED:dvi:%:%', v_used, v_limit
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.usage_monthly (shop_id, year_month, metric, count)
  VALUES (NEW.shop_id, v_year_month, 'dvi', 1)
  ON CONFLICT (shop_id, year_month, metric)
  DO UPDATE SET count = public.usage_monthly.count + 1, updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_dvi_limit ON public.inspections;
CREATE TRIGGER trg_enforce_dvi_limit
  BEFORE INSERT ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION enforce_dvi_monthly_limit();

-- ─── Completed jobs limit trigger ─────────────────────────────────────────────
-- closed_jobs.id is the same as job_cards.id (the job UUID).
-- Idempotency: if this job was already closed this month (same id), skip the count.
-- This handles the reopen → reclose case: still counts as 1 job this month.

CREATE OR REPLACE FUNCTION enforce_completed_jobs_monthly_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_plan       text;
  v_year_month text;
  v_limit      integer;
  v_used       integer;
  v_already    boolean;
BEGIN
  IF _is_d1_internal_shop(NEW.shop_id) THEN
    RETURN NEW;
  END IF;

  v_plan := _get_shop_plan(NEW.shop_id);
  IF v_plan <> 'free' THEN RETURN NEW; END IF;

  v_year_month := _current_year_month();

  -- Idempotency: job already closed this month → treat as reclose, don't recount
  SELECT EXISTS (
    SELECT 1 FROM public.closed_jobs
     WHERE id = NEW.id
       AND shop_id = NEW.shop_id
  ) INTO v_already;

  IF v_already THEN RETURN NEW; END IF;

  v_limit := _free_monthly_limit('completed_jobs');
  v_used  := _get_monthly_count(NEW.shop_id, 'completed_jobs', v_year_month);

  IF v_used >= v_limit THEN
    RAISE EXCEPTION 'LIMIT_EXCEEDED:completed_jobs:%:%', v_used, v_limit
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.usage_monthly (shop_id, year_month, metric, count)
  VALUES (NEW.shop_id, v_year_month, 'completed_jobs', 1)
  ON CONFLICT (shop_id, year_month, metric)
  DO UPDATE SET count = public.usage_monthly.count + 1, updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_completed_jobs_limit ON public.closed_jobs;
CREATE TRIGGER trg_enforce_completed_jobs_limit
  BEFORE INSERT ON public.closed_jobs
  FOR EACH ROW EXECUTE FUNCTION enforce_completed_jobs_monthly_limit();
