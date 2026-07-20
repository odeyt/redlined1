-- Phase B RLS Limits: server-enforced total-resource limits for Free plan
--
-- Applies BEFORE INSERT triggers to customers, vehicles, and technicians tables.
-- Triggers fire for ALL insert paths (browser client, service role, SQL editor)
-- so limits cannot be bypassed by going around API routes.
--
-- D1 internal shops (INTERNAL_SHOP_IDS) are always bypassed.
-- When BILLING_ENABLED env is not set, limits still apply at DB layer because
-- the DB has no awareness of the app env var — that bypass is handled in app code only.
--
-- Free plan limits enforced here:
--   customers   <= 10 (total, per shop)
--   vehicles    <= 10 (total, per shop)
--   technicians <= 1  (active status != 'Inactive', per shop)
--
-- users_total is enforced in app/api/invite/route.ts (only creation path is the invite route).
-- locations_total is hardcoded to 1 (multi-location feature not yet built).
-- storage_mb enforcement is deferred to storage upload API route (Phase C).

-- ─── Internal shop IDs (always bypass limits) ─────────────────────────────────

-- These UUIDs match INTERNAL_SHOP_IDS in lib/entitlements/entitlementEngine.ts
-- Update both places if D1 internal shops change.
CREATE OR REPLACE FUNCTION _is_d1_internal_shop(p_shop_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p_shop_id IN (
    '38d55fae-741b-4bac-b520-f96eed65bf38'::uuid,
    '90b72748-bf01-4456-999f-f4ba48091606'::uuid
  );
$$;

-- ─── Plan limit lookup helper ──────────────────────────────────────────────────

-- Returns the Free plan limit for a given resource metric.
-- Returns NULL for unlimited (paid plans).
-- Only called after confirming shop is on Free plan.
CREATE OR REPLACE FUNCTION _free_plan_limit(p_metric text)
RETURNS integer
LANGUAGE sql IMMUTABLE SECURITY DEFINER AS $$
  SELECT CASE p_metric
    WHEN 'customers_total'    THEN 10
    WHEN 'vehicles_total'     THEN 10
    WHEN 'technicians_total'  THEN 1
    ELSE NULL
  END;
$$;

-- ─── Get effective plan for a shop ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _get_shop_plan(p_shop_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT p.plan
       FROM public.profiles p
       JOIN public.shop_users su ON su.user_id = p.id
      WHERE su.shop_id = p_shop_id
        AND su.role = 'owner'
      LIMIT 1),
    'free'
  );
$$;

-- ─── Customers limit trigger ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION enforce_customers_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_plan  text;
  v_limit integer;
  v_count integer;
BEGIN
  -- Internal shops always bypass
  IF _is_d1_internal_shop(NEW.shop_id) THEN
    RETURN NEW;
  END IF;

  v_plan := _get_shop_plan(NEW.shop_id);

  -- Only Free plan has a hard limit; paid plans are unlimited here
  IF v_plan <> 'free' THEN
    RETURN NEW;
  END IF;

  v_limit := _free_plan_limit('customers_total');
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.customers
   WHERE shop_id = NEW.shop_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'LIMIT_EXCEEDED:customers_total:%:%', v_count, v_limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_customers_limit ON public.customers;
CREATE TRIGGER trg_enforce_customers_limit
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION enforce_customers_limit();

-- ─── Vehicles limit trigger ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION enforce_vehicles_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_plan  text;
  v_limit integer;
  v_count integer;
BEGIN
  IF _is_d1_internal_shop(NEW.shop_id) THEN
    RETURN NEW;
  END IF;

  v_plan := _get_shop_plan(NEW.shop_id);

  IF v_plan <> 'free' THEN
    RETURN NEW;
  END IF;

  v_limit := _free_plan_limit('vehicles_total');
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.vehicles
   WHERE shop_id = NEW.shop_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'LIMIT_EXCEEDED:vehicles_total:%:%', v_count, v_limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_vehicles_limit ON public.vehicles;
CREATE TRIGGER trg_enforce_vehicles_limit
  BEFORE INSERT ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION enforce_vehicles_limit();

-- ─── Technicians limit trigger ─────────────────────────────────────────────────
-- Counts active technicians (status != 'Inactive') per shop.
-- Also fires on UPDATE to handle reactivation (status changed from Inactive → active).

CREATE OR REPLACE FUNCTION enforce_technicians_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_plan    text;
  v_limit   integer;
  v_count   integer;
  v_shop_id uuid;
BEGIN
  v_shop_id := NEW.shop_id;

  IF _is_d1_internal_shop(v_shop_id) THEN
    RETURN NEW;
  END IF;

  -- Only check when inserting an active technician, or reactivating one
  IF TG_OP = 'INSERT' AND NEW.status = 'Inactive' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- Only enforce on transition from Inactive → active
    IF OLD.status <> 'Inactive' THEN RETURN NEW; END IF;
    IF NEW.status = 'Inactive' THEN RETURN NEW; END IF;
  END IF;

  v_plan := _get_shop_plan(v_shop_id);

  IF v_plan <> 'free' THEN
    RETURN NEW;
  END IF;

  v_limit := _free_plan_limit('technicians_total');
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  -- Count currently active technicians (excluding the row being changed on UPDATE)
  IF TG_OP = 'UPDATE' THEN
    SELECT COUNT(*) INTO v_count
      FROM public.technicians
     WHERE shop_id = v_shop_id
       AND status <> 'Inactive'
       AND id <> OLD.id;
  ELSE
    SELECT COUNT(*) INTO v_count
      FROM public.technicians
     WHERE shop_id = v_shop_id
       AND status <> 'Inactive';
  END IF;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'LIMIT_EXCEEDED:technicians_total:%:%', v_count, v_limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_technicians_limit_insert ON public.technicians;
CREATE TRIGGER trg_enforce_technicians_limit_insert
  BEFORE INSERT ON public.technicians
  FOR EACH ROW EXECUTE FUNCTION enforce_technicians_limit();

DROP TRIGGER IF EXISTS trg_enforce_technicians_limit_update ON public.technicians;
CREATE TRIGGER trg_enforce_technicians_limit_update
  BEFORE UPDATE ON public.technicians
  FOR EACH ROW EXECUTE FUNCTION enforce_technicians_limit();
