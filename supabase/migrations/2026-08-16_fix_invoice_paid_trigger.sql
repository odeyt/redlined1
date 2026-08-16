-- Unbreak marking an invoice Paid.
--
-- RUN AGAINST redlined1, immediately. This is a production outage fix.
--
-- alert_invoice_paid (added 2026-08-13) referenced NEW.id. invoices has no id
-- column — it is keyed on number, alone among the tables these triggers
-- touch. Every attempt to mark an invoice Paid therefore aborted with
--
--   42703  record "NEW" has no field "id"
--
-- and the app reported only "Payment failed", because the catch there tested
-- `e instanceof Error` and Supabase throws plain objects. A trigger written to
-- announce a payment was preventing it, silently, since 2026-08-13.
--
-- Any invoice anyone tried to mark Paid between then and now failed. Worth
-- checking whether staff worked around it.
--
-- The other four triggers (repair_orders, inspections, estimates,
-- parts_orders) are unaffected — those tables do have id.

CREATE OR REPLACE FUNCTION public.alert_invoice_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NEW.status = 'Paid' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.emit_alert_event(
      NEW.shop_id, 'invoice.paid', NULL,
      'Invoice ' || COALESCE(NEW.number, '') || ' paid',
      COALESCE(NEW.customer, '') || CASE WHEN NEW.vehicle IS NULL THEN '' ELSE ' · ' || NEW.vehicle END,
      'invoice', NEW.number);
  END IF;
  RETURN NEW;
END $fn$;

-- ── Verification ────────────────────────────────────────────────────────────
--
-- Mark an invoice Paid in the app. It should succeed, and:
--   SELECT event_type, title, entity_id FROM public.alert_events
--   WHERE event_type = 'invoice.paid' ORDER BY created_at DESC LIMIT 3;
--
-- entity_id holds the invoice number, which is that table's key.
--
-- Invoices that could not be paid while this was broken:
--   SELECT number, customer, status FROM public.invoices
--   WHERE status = 'Draft' ORDER BY created_at DESC LIMIT 20;
--
-- ── The lesson, recorded ────────────────────────────────────────────────────
-- These triggers were written by copying one shape five times, then checking
-- the columns each referenced — from a list assembled by hand, which omitted
-- id, the field the copying had introduced. The check looked thorough and
-- skipped the only thing that mattered.
--
-- Before adding a trigger, read the target table's actual primary key rather
-- than assuming it is id. In this schema, invoices is keyed on number and
-- job_cards on a text id like 'JC-1784537040284'.
