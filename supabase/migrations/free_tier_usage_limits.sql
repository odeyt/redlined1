-- ============================================================
-- Free Forever plan usage limits.
--
-- Marketing (pricing page) promises: up to 10 customers, up to 10
-- vehicles, up to 5 jobs per calendar month. Nothing enforced this
-- before this migration — confirmed via full-repo grep, zero limit
-- checks existed anywhere.
--
-- Enforced here as BEFORE INSERT triggers rather than in application
-- code, because customer/vehicle/job_cards rows are created from many
-- different code paths (services/customerService.ts, services/
-- vehicleService.ts, services/jobCardService.ts, and several direct
-- supabase.from(...).insert() call sites in features/vin/VinView.tsx,
-- features/invoices/InvoicesView.tsx, features/scheduling/
-- SchedulingView.tsx, features/communication/CommunicationView.tsx).
-- A trigger is the only enforcement point that covers all of them,
-- including any future call site, without relying on every caller
-- remembering to check first.
--
-- Only shops with subscriptions.plan_key = 'free' are limited. Shops
-- with a paid plan_key, or with no subscriptions row at all (should
-- not happen post-onboarding-fix, but fail open rather than blocking
-- legitimate paid shops on a missing row) are never limited by this.
--
-- On limit, raises a Postgres exception with a machine-parseable
-- message ('FREE_TIER_LIMIT:<table>:<limit>') that
-- lib/freeTierLimit.ts turns into a friendly upgrade prompt in the UI.
-- ============================================================

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
  SELECT plan_key INTO v_plan_key
  FROM public.subscriptions
  WHERE shop_id = NEW.shop_id;

  -- Not on the free plan (paid, or no subscription row yet) — never limited here.
  IF v_plan_key IS DISTINCT FROM 'free' THEN
    RETURN NEW;
  END IF;

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

DROP TRIGGER IF EXISTS trg_free_tier_limit ON public.customers;
CREATE TRIGGER trg_free_tier_limit
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_free_tier_count_limit();

DROP TRIGGER IF EXISTS trg_free_tier_limit ON public.vehicles;
CREATE TRIGGER trg_free_tier_limit
  BEFORE INSERT ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_free_tier_count_limit();

DROP TRIGGER IF EXISTS trg_free_tier_limit ON public.job_cards;
CREATE TRIGGER trg_free_tier_limit
  BEFORE INSERT ON public.job_cards
  FOR EACH ROW EXECUTE FUNCTION public.enforce_free_tier_count_limit();
