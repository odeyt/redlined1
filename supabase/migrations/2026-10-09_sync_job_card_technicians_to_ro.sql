-- Keep a Repair Order's technician in step with its Job Card's technicians.
--
-- The other half of 2026-09-27_sync_ro_technician_to_job_card.sql, which copies
-- an RO's technician to its linked Job Card. Staff also assign on the Job Card
-- (Job Cards screen), which wrote only job_cards.technicians and left the RO,
-- and every report that reads repair_orders.technician, showing nobody.
-- Reported from production 2026-10-09 (a Jeep Wrangler's technician did not show).
--
-- REQUIRES 2026-09-27_sync_ro_technician_to_job_card.sql first. This file stops
-- with an error, changing nothing, if that trigger is missing.
--
-- Rules, mirroring the 2026-09-27 half:
--   - Fires only when a Job Card's technicians actually change.
--   - Updates the RO linked by repair_orders.job_card_id in the SAME shop, and
--     only when customer and vehicle text match, as the other half requires.
--   - Writes the names joined by ', ', which is how the RO editor writes them.
--     Clearing the Job Card clears the RO.
--   - No echo: when the Job Card change was itself made by a trigger (the RO
--     half, pg_trigger_depth() > 1), nothing is written back. The RO half also
--     skips a Job Card that already matches. So an edit on either side writes
--     the other once, and stops.
--   - A failure is contained: the Job Card save always succeeds, and the RO is
--     left as it was, with a WARNING naming both records.
--   - Existing rows are not rewritten. A mismatched pair re-syncs the next time
--     either side's technicians are saved.
--
-- The RO update fires no alert (no repair_orders trigger watches technician).
-- The RO half's Job Card update does fire job.assigned, as assigning on the
-- Job Card always has.

BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'repair_orders_sync_job_card_technicians'
      AND tgrelid = 'public.repair_orders'::regclass
  ) THEN
    RAISE EXCEPTION 'Apply 2026-09-27_sync_ro_technician_to_job_card.sql first: trigger repair_orders_sync_job_card_technicians is missing. Nothing was changed.';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.sync_job_card_technicians_to_ro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  names text;
BEGIN
  -- Made by another trigger (the RO -> Job Card half): do not write it back.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- to_jsonb works whether technicians is text[] or jsonb; both have been used.
  IF to_jsonb(NEW.technicians) IS NOT DISTINCT FROM to_jsonb(OLD.technicians) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(string_agg(btrim(t.name), ', ' ORDER BY t.ordinality), '')
    INTO names
  FROM jsonb_array_elements_text(
         CASE WHEN jsonb_typeof(to_jsonb(NEW.technicians)) = 'array'
              THEN to_jsonb(NEW.technicians) ELSE '[]'::jsonb END)
       WITH ORDINALITY AS t(name, ordinality)
  WHERE btrim(t.name) <> '';

  BEGIN
    UPDATE public.repair_orders AS ro
    SET technician = names
    WHERE ro.job_card_id = NEW.id
      AND ro.shop_id = NEW.shop_id
      AND ro.customer_name = NEW.customer
      AND ro.vehicle = NEW.vehicle
      AND COALESCE(ro.technician, '') IS DISTINCT FROM names;
  EXCEPTION WHEN OTHERS THEN
    -- Keep the Job Card save; leave the RO as it was. Operators reconcile from this.
    RAISE WARNING 'Job card % technicians not synced to its repair order (SQLSTATE %): %',
      NEW.id, SQLSTATE, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_job_card_technicians_to_ro() FROM PUBLIC;

DROP TRIGGER IF EXISTS job_cards_sync_ro_technician ON public.job_cards;
CREATE TRIGGER job_cards_sync_ro_technician
  AFTER UPDATE OF technicians ON public.job_cards
  FOR EACH ROW EXECUTE FUNCTION public.sync_job_card_technicians_to_ro();

COMMIT;

-- ── Before applying (read-only) ─────────────────────────────────────────────
-- The 2026-09-27 half must be installed (1 row):
--   SELECT tgname FROM pg_trigger WHERE tgname = 'repair_orders_sync_job_card_technicians';
--
-- ── After applying ──────────────────────────────────────────────────────────
-- Both halves installed (2 rows):
--   SELECT tgname, tgenabled FROM pg_trigger
--   WHERE tgname IN ('repair_orders_sync_job_card_technicians', 'job_cards_sync_ro_technician');
--
-- Open jobs whose two records still disagree (read-only). Each re-syncs when
-- either side's technicians are saved again in the app:
--   SELECT ro.ro_number, ro.technician, jc.id AS job_card, jc.technicians
--   FROM public.repair_orders ro
--   JOIN public.job_cards jc ON jc.id = ro.job_card_id AND jc.shop_id = ro.shop_id
--   WHERE ro.status NOT IN ('Complete', 'Closed', 'Void')
--     AND COALESCE(ro.technician, '') IS DISTINCT FROM COALESCE(
--           (SELECT string_agg(btrim(x), ', ') FROM jsonb_array_elements_text(to_jsonb(jc.technicians)) AS x
--             WHERE btrim(x) <> ''), '');
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   DROP TRIGGER IF EXISTS job_cards_sync_ro_technician ON public.job_cards;
--   DROP FUNCTION IF EXISTS public.sync_job_card_technicians_to_ro();
-- Leaves the 2026-09-27 half in place. Technicians already copied stay as they are.
