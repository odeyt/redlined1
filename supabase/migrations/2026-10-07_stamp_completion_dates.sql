-- ============================================================
-- Completion dates on repair orders and job cards, stamped by the database.
--
-- Reports place a completed job in the month of its closed_date (repair
-- orders and job cards). The app now stamps and clears it correctly on every
-- screen (lib/repairOrders/completionStamp.ts), but a date that depends on
-- every caller remembering is how it went wrong before: a reopened repair
-- order kept its old completion date and, signed off again, reused it. This
-- makes the rule hold for any path, including ones written later.
--
-- The rule, for both tables:
--   * becomes finished and no new date was supplied  -> closed_date = now()
--   * becomes finished with a date supplied           -> that date is kept
--   * is finished and stays finished                  -> date untouched
--   * is (or becomes) not finished                    -> closed_date = NULL
-- Finished = 'Complete' or 'Closed' (repair orders); 'Complete', 'Closed' or
-- 'Invoiced' (job cards), the same sets the reports use.
--
-- No existing rows are changed: the triggers fire only on future inserts and
-- status changes. Historic rows that are finished with no date stay as they
-- are (there is no evidence of when they finished) and are counted by the
-- read-only query at the end.
--
-- One transaction. Re-running replaces the functions and triggers in place.
-- Rollback:
--   BEGIN;
--   DROP TRIGGER IF EXISTS repair_orders_stamp_closed_date ON public.repair_orders;
--   DROP TRIGGER IF EXISTS job_cards_stamp_closed_date ON public.job_cards;
--   DROP FUNCTION IF EXISTS public.stamp_repair_order_closed_date();
--   DROP FUNCTION IF EXISTS public.stamp_job_card_closed_date();
--   COMMIT;
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.stamp_repair_order_closed_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  now_finished boolean := NEW.status IN ('Complete', 'Closed');
  was_finished boolean := TG_OP = 'UPDATE' AND OLD.status IN ('Complete', 'Closed');
BEGIN
  IF NOT now_finished THEN
    NEW.closed_date := NULL;
  ELSIF NOT was_finished THEN
    -- Becoming finished now. Keep a date the caller supplied in this write;
    -- otherwise (none, or a stale one carried over) stamp the moment it happened.
    IF NEW.closed_date IS NULL
       OR (TG_OP = 'UPDATE' AND NEW.closed_date IS NOT DISTINCT FROM OLD.closed_date) THEN
      NEW.closed_date := now();
    END IF;
  ELSIF NEW.closed_date IS NULL THEN
    NEW.closed_date := COALESCE(OLD.closed_date, now());
  END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.stamp_job_card_closed_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  now_finished boolean := NEW.status IN ('Complete', 'Closed', 'Invoiced');
  was_finished boolean := TG_OP = 'UPDATE' AND OLD.status IN ('Complete', 'Closed', 'Invoiced');
BEGIN
  IF NOT now_finished THEN
    NEW.closed_date := NULL;
  ELSIF NOT was_finished THEN
    IF NEW.closed_date IS NULL
       OR (TG_OP = 'UPDATE' AND NEW.closed_date IS NOT DISTINCT FROM OLD.closed_date) THEN
      NEW.closed_date := now();
    END IF;
  ELSIF NEW.closed_date IS NULL THEN
    NEW.closed_date := COALESCE(OLD.closed_date, now());
  END IF;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION public.stamp_repair_order_closed_date() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stamp_job_card_closed_date() FROM PUBLIC;

DROP TRIGGER IF EXISTS repair_orders_stamp_closed_date ON public.repair_orders;
CREATE TRIGGER repair_orders_stamp_closed_date
  BEFORE INSERT OR UPDATE OF status, closed_date ON public.repair_orders
  FOR EACH ROW EXECUTE FUNCTION public.stamp_repair_order_closed_date();

DROP TRIGGER IF EXISTS job_cards_stamp_closed_date ON public.job_cards;
CREATE TRIGGER job_cards_stamp_closed_date
  BEFORE INSERT OR UPDATE OF status, closed_date ON public.job_cards
  FOR EACH ROW EXECUTE FUNCTION public.stamp_job_card_closed_date();

-- Acceptance (read-only): both triggers attached and enabled.
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_trigger
      WHERE tgname IN ('repair_orders_stamp_closed_date', 'job_cards_stamp_closed_date')
        AND NOT tgisinternal AND tgenabled = 'O') <> 2 THEN
    RAISE EXCEPTION 'completion-date triggers did not attach';
  END IF;
  RAISE NOTICE 'completion-date triggers attached';
END $$;

COMMIT;

-- ── After applying (read-only): historic rows this cannot date ─────────────
-- SELECT
--   (SELECT count(*) FROM public.repair_orders WHERE status IN ('Complete','Closed') AND closed_date IS NULL) AS finished_ro_without_date,
--   (SELECT count(*) FROM public.repair_orders WHERE status NOT IN ('Complete','Closed') AND closed_date IS NOT NULL) AS open_ro_with_stale_date,
--   (SELECT count(*) FROM public.job_cards WHERE status IN ('Complete','Closed','Invoiced') AND closed_date IS NULL) AS finished_jc_without_date;
