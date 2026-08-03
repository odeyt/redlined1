-- Repair-order status changes, recorded when they happen.
--
-- The notifications panel showed "No notifications yet" permanently. Three
-- reasons, and the trigger below removes all three:
--
-- 1. The feed lived in a module-level array in the browser. It started empty on
--    every page load, so it could only ever show a change that happened while
--    that tab was open. Reload and the history was gone.
--
-- 2. It relied on Supabase Realtime delivering payload.old, which carries the
--    previous status only when the table has REPLICA IDENTITY FULL. Without
--    that, "Open → Complete" arrives as "→ Complete".
--
-- 3. There was nothing to fall back on: no audit table, and repair_orders has
--    no updated_at, so recent changes could not be reconstructed at all.
--
-- A trigger sees OLD and NEW directly, so both statuses are always correct and
-- nothing depends on a replication setting. The row persists, so the panel has
-- history on first load rather than only live events.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ro_status_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       UUID NOT NULL,
  repair_order_id UUID NOT NULL,
  ro_number     TEXT,
  customer_name TEXT,
  vehicle       TEXT,
  old_status    TEXT,
  new_status    TEXT NOT NULL,
  changed_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ro_status_events_shop_idx
  ON public.ro_status_events(shop_id, created_at DESC);

-- Denormalises ro_number, customer and vehicle deliberately. The panel shows
-- what a row said at the time; joining back to repair_orders would rewrite
-- history when a customer is renamed, and would break entirely if the order is
-- deleted.
CREATE OR REPLACE FUNCTION public.record_ro_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.ro_status_events
      (shop_id, repair_order_id, ro_number, customer_name, vehicle, old_status, new_status, changed_by)
    VALUES
      (NEW.shop_id, NEW.id, NEW.ro_number, NEW.customer_name, NEW.vehicle,
       OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS repair_orders_status_change ON public.repair_orders;
CREATE TRIGGER repair_orders_status_change
  AFTER UPDATE ON public.repair_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.record_ro_status_change();

ALTER TABLE public.ro_status_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ro_status_events'::regclass) THEN
    RAISE EXCEPTION 'RLS did not enable on ro_status_events';
  END IF;
END $$;

DROP POLICY IF EXISTS ro_status_events_select ON public.ro_status_events;
CREATE POLICY ro_status_events_select ON public.ro_status_events
  FOR SELECT TO authenticated
  USING (shop_id IN (SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid()));

-- No INSERT policy for customers: only the trigger writes here, and it runs as
-- SECURITY DEFINER. A client that could insert could fabricate history.
-- No UPDATE or DELETE either — an audit row that can be edited is not an audit.

GRANT SELECT ON public.ro_status_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ro_status_events TO service_role;

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────────
--
-- The trigger is attached:
--
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.repair_orders'::regclass AND NOT tgisinternal;
--
-- It fires. Change a repair order's status in the app, then:
--
--   SELECT ro_number, old_status, new_status, created_at
--   FROM public.ro_status_events ORDER BY created_at DESC LIMIT 5;
--
-- Expect one row per status change, with BOTH statuses populated — that is the
-- part Realtime could not deliver.
--
-- anon sees nothing:
--
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'ro_status_events' AND grantee = 'anon';
--
-- Expect zero rows.
