-- Repair-order status changes as alert_events too.
--
-- RUN AGAINST redlined1, on its own, AFTER 2026-08-13_alert_events.sql.
--
-- Why this exists: the toaster used to read ro_status_events directly by
-- calling useNotifications(). Sidebar already calls that hook, so the app
-- opened two Supabase Realtime channels on the same topic and the shell
-- crashed for every signed-in user. The toaster now reads alert_events only —
-- one feed, one subscription — which means status changes have to arrive
-- there.
--
-- ro_status_events is NOT replaced. The notifications panel still reads it,
-- it holds the old/new status pair that alerts do not need, and it is the
-- audit trail. This trigger is additive: the same change now records a row in
-- each, one for history and one to be told about.

BEGIN;

CREATE OR REPLACE FUNCTION public.alert_ro_status_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- 'Pending Approval' already has its own alert with a clearer title, so
    -- skip it here rather than announce the same change twice.
    IF NEW.status <> 'Pending Approval' THEN
      PERFORM public.emit_alert_event(
        NEW.shop_id, 'ro.status_changed', NULL,
        COALESCE(NEW.ro_number, 'A repair order') || ' → ' || NEW.status,
        COALESCE(NEW.customer_name, '') || CASE WHEN NEW.vehicle IS NULL THEN '' ELSE ' · ' || NEW.vehicle END,
        'repair_order', NEW.id::text);
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS repair_orders_alert_status_changed ON public.repair_orders;
CREATE TRIGGER repair_orders_alert_status_changed
  AFTER UPDATE ON public.repair_orders
  FOR EACH ROW EXECUTE FUNCTION public.alert_ro_status_changed();

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Verification ────────────────────────────────────────────────────────────
--
-- Both repair-order triggers present:
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.repair_orders'::regclass AND NOT tgisinternal
--   ORDER BY tgname;
--
-- Expect repair_orders_alert_pending_approval,
-- repair_orders_alert_status_changed and repair_orders_status_change.
--
-- Moving an order to In Progress produces exactly one alert row:
--   SELECT event_type, title FROM public.alert_events
--   ORDER BY created_at DESC LIMIT 3;
--
-- Moving one to Pending Approval produces exactly one, of type
-- ro.pending_approval — not two.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   DROP TRIGGER IF EXISTS repair_orders_alert_status_changed ON public.repair_orders;
--   DROP FUNCTION IF EXISTS public.alert_ro_status_changed();
