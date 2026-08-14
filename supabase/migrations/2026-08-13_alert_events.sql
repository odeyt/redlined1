-- Alert events: one table, one row per thing worth telling somebody about.
--
-- RUN AGAINST redlined1. Check the project selector — not d1express-dev.
-- Run this file on its own; the SQL editor executes a tab as one transaction.
--
-- Follows ro_status_events (2026-08-03) deliberately, because that design has
-- earned it: triggers write, clients only read, and display fields are
-- denormalised so a row says what was true when it happened rather than being
-- rewritten by a later rename.
--
-- The five triggers below cover the events whose recipients actually have
-- logins today: owner, manager and advisor. Technician events (job assigned,
-- work added) are deliberately absent — measured on 2026-08-13, 25 technicians
-- exist as records, only 1 has an email matching a login, and no shop_users row
-- has the technician role. An alert nobody can receive is not a feature. Those
-- arrive once technicians have accounts and technicians.user_id links them.
--
-- Status values below were read from production, not assumed:
--   repair_orders  Open | In Progress | Pending Parts | Pending Approval | Complete | Closed
--   inspections    In Progress | Needs Approval | Completed
--   estimates      Draft | Approved | Converted
--   parts_orders   Pending | Received
--   invoices       Draft | Paid

BEGIN;

CREATE TABLE IF NOT EXISTS public.alert_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      UUID NOT NULL,
  -- Matches an id in lib/alerts/catalogue.ts. Text, not an enum: adding an
  -- alert should not require a migration to a type every table depends on.
  event_type   TEXT NOT NULL,
  -- Exactly one addressing mode is used per row. target_user_id for "this is
  -- yours"; target_role for "whoever holds this job". Both null would mean
  -- everyone in the shop, which nothing currently emits.
  target_user_id UUID,
  target_role  TEXT,
  title        TEXT NOT NULL,
  body         TEXT,
  -- What it is about, so the client can navigate to it.
  entity_type  TEXT,
  entity_id    UUID,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alert_events_shop_idx
  ON public.alert_events(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS alert_events_user_idx
  ON public.alert_events(target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;

-- ── Emitter ─────────────────────────────────────────────────────────────────
-- One helper so every trigger below records rows the same shape.
CREATE OR REPLACE FUNCTION public.emit_alert_event(
  p_shop_id UUID, p_event_type TEXT, p_target_role TEXT,
  p_title TEXT, p_body TEXT, p_entity_type TEXT, p_entity_id UUID
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  INSERT INTO public.alert_events
    (shop_id, event_type, target_role, title, body, entity_type, entity_id, created_by)
  VALUES
    (p_shop_id, p_event_type, p_target_role, p_title, p_body, p_entity_type, p_entity_id, auth.uid());
$fn$;

REVOKE EXECUTE ON FUNCTION public.emit_alert_event(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;

-- ── 1. Work waiting for QA sign-off ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.alert_ro_pending_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NEW.status = 'Pending Approval' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.emit_alert_event(
      NEW.shop_id, 'ro.pending_approval', NULL,
      COALESCE(NEW.ro_number, 'A repair order') || ' is ready for QA sign-off',
      COALESCE(NEW.customer_name, '') || CASE WHEN NEW.vehicle IS NULL THEN '' ELSE ' · ' || NEW.vehicle END,
      'repair_order', NEW.id);
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS repair_orders_alert_pending_approval ON public.repair_orders;
CREATE TRIGGER repair_orders_alert_pending_approval
  AFTER UPDATE ON public.repair_orders
  FOR EACH ROW EXECUTE FUNCTION public.alert_ro_pending_approval();

-- ── 2. Inspection completed ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.alert_inspection_completed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NEW.status = 'Completed' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.emit_alert_event(
      NEW.shop_id, 'inspection.completed', NULL,
      'Inspection ' || COALESCE(NEW.inspection_number, '') || ' completed',
      COALESCE(NEW.customer_name, '') || CASE WHEN NEW.vehicle IS NULL THEN '' ELSE ' · ' || NEW.vehicle END,
      'inspection', NEW.id);
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS inspections_alert_completed ON public.inspections;
CREATE TRIGGER inspections_alert_completed
  AFTER UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.alert_inspection_completed();

-- ── 3. Estimate approved by the customer ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.alert_estimate_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NEW.status = 'Approved' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.emit_alert_event(
      NEW.shop_id, 'estimate.approved', NULL,
      'Estimate ' || COALESCE(NEW.estimate_number, '') || ' approved',
      COALESCE(NEW.customer_name, '') || CASE WHEN NEW.vehicle IS NULL THEN '' ELSE ' · ' || NEW.vehicle END,
      'estimate', NEW.id);
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS estimates_alert_approved ON public.estimates;
CREATE TRIGGER estimates_alert_approved
  AFTER UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.alert_estimate_approved();

-- ── 4. Parts received ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.alert_parts_received()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NEW.status = 'Received' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.emit_alert_event(
      NEW.shop_id, 'parts.received', NULL,
      COALESCE(NULLIF(NEW.part_name, ''), 'Parts') || ' received',
      COALESCE(NEW.vendor_name, '') || CASE WHEN NEW.vehicle IS NULL THEN '' ELSE ' · ' || NEW.vehicle END,
      'parts_order', NEW.id);
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS parts_orders_alert_received ON public.parts_orders;
CREATE TRIGGER parts_orders_alert_received
  AFTER UPDATE ON public.parts_orders
  FOR EACH ROW EXECUTE FUNCTION public.alert_parts_received();

-- ── 5. Invoice paid ─────────────────────────────────────────────────────────
-- Money in. Addressed to managers and owners rather than everyone: it is the
-- one event here a technician has no use for.
CREATE OR REPLACE FUNCTION public.alert_invoice_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NEW.status = 'Paid' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.emit_alert_event(
      NEW.shop_id, 'invoice.paid', NULL,
      'Invoice ' || COALESCE(NEW.number, '') || ' paid',
      COALESCE(NEW.customer, '') || CASE WHEN NEW.vehicle IS NULL THEN '' ELSE ' · ' || NEW.vehicle END,
      'invoice', NEW.id);
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS invoices_alert_paid ON public.invoices;
CREATE TRIGGER invoices_alert_paid
  AFTER UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.alert_invoice_paid();

-- ── Access ──────────────────────────────────────────────────────────────────
ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.alert_events'::regclass) THEN
    RAISE EXCEPTION 'RLS did not enable on alert_events';
  END IF;
END $$;

-- A row is visible to a member of its shop when it is addressed to them
-- personally, to their role, or to the whole shop. Role comes from shop_users,
-- so revoking someone's role stops their alerts with it.
DROP POLICY IF EXISTS alert_events_select ON public.alert_events;
CREATE POLICY alert_events_select ON public.alert_events
  FOR SELECT TO authenticated
  USING (
    shop_id IN (SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid())
    AND (
      target_user_id = auth.uid()
      OR (
        target_user_id IS NULL
        AND (
          target_role IS NULL
          OR target_role IN (
            SELECT role FROM public.shop_users
            WHERE user_id = auth.uid() AND shop_id = alert_events.shop_id
          )
        )
      )
    )
  );

-- Triggers write, nobody else. A client that could insert could fabricate an
-- alert; no UPDATE or DELETE, because an alert that can be edited after the
-- fact is not a record of anything.
GRANT SELECT ON public.alert_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_events TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Verification ────────────────────────────────────────────────────────────
--
-- All five triggers attached:
--
--   SELECT tgname, tgrelid::regclass AS table_name FROM pg_trigger
--   WHERE NOT tgisinternal AND tgname LIKE '%alert%' ORDER BY table_name;
--
-- Expect five rows: estimates, inspections, invoices, parts_orders,
-- repair_orders.
--
-- They fire. Mark an invoice Paid in the app, then:
--
--   SELECT event_type, title, body, created_at
--   FROM public.alert_events ORDER BY created_at DESC LIMIT 5;
--
-- anon sees nothing:
--
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'alert_events' AND grantee = 'anon';
--
-- Expect zero rows.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   DROP TRIGGER IF EXISTS repair_orders_alert_pending_approval ON public.repair_orders;
--   DROP TRIGGER IF EXISTS inspections_alert_completed ON public.inspections;
--   DROP TRIGGER IF EXISTS estimates_alert_approved ON public.estimates;
--   DROP TRIGGER IF EXISTS parts_orders_alert_received ON public.parts_orders;
--   DROP TRIGGER IF EXISTS invoices_alert_paid ON public.invoices;
--   DROP TABLE IF EXISTS public.alert_events;
