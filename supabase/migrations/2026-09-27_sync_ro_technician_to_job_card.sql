-- Keep a linked Job Card's assignment in step with Repair Order edits.
-- Intake creates the two records together, but the RO editor later writes only
-- repair_orders.technician. That leaves the Job Card queue showing Unassigned.
--
-- A failed Job Card update (including its alert/push triggers) is contained
-- so the primary RO save succeeds. It never touches a Job Card in another
-- shop. Existing assignments are not bulk rewritten.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_ro_technician_to_job_card()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  names jsonb;
BEGIN
  IF NEW.job_card_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A manually opened RO with no technician must not erase the Job Card's
    -- existing assignment. A later explicit edit to blank does clear it.
    IF NULLIF(btrim(NEW.technician), '') IS NULL THEN
      RETURN NEW;
    END IF;
  ELSE
    -- The RO editor sends the technician field even when its value did not
    -- change. Use that edit to repair an already mismatched linked Job Card.
    IF NEW.job_card_id IS DISTINCT FROM OLD.job_card_id
       AND NULLIF(btrim(NEW.technician), '') IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(part.name ORDER BY split.ordinality), '[]'::jsonb)
    INTO names
  FROM regexp_split_to_table(COALESCE(NEW.technician, ''), ',')
       WITH ORDINALITY AS split(raw, ordinality)
  CROSS JOIN LATERAL (SELECT btrim(split.raw) AS name) AS part
  WHERE part.name <> '';

  -- jsonb_populate_record converts the JSON array to the column's actual
  -- type (text[] or jsonb). Both have been used in RedlineD1 schemas.
  BEGIN
    UPDATE public.job_cards AS jc
    SET technicians = (
      jsonb_populate_record(NULL::public.job_cards, jsonb_build_object('technicians', names))
    ).technicians
    WHERE jc.id = NEW.job_card_id
      AND jc.shop_id = NEW.shop_id
      AND jc.customer = NEW.customer_name
      AND jc.vehicle = NEW.vehicle
      AND COALESCE(to_jsonb(jc.technicians), '[]'::jsonb) IS DISTINCT FROM names;
  EXCEPTION WHEN OTHERS THEN
    -- Roll back the Job Card update and any alerts it emitted, but keep the
    -- Repair Order write. Operators can reconcile using this warning.
    RAISE WARNING 'RO % technician not synced to job card % (SQLSTATE %): %',
      NEW.ro_number, NEW.job_card_id, SQLSTATE, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_ro_technician_to_job_card() FROM PUBLIC;

DROP TRIGGER IF EXISTS repair_orders_sync_job_card_technicians ON public.repair_orders;
CREATE TRIGGER repair_orders_sync_job_card_technicians
  AFTER INSERT OR UPDATE OF technician, job_card_id ON public.repair_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_ro_technician_to_job_card();

COMMIT;

-- After applying, edit a linked RO's technician in the app and verify:
-- SELECT ro.ro_number, ro.technician, jc.technicians
-- FROM public.repair_orders ro
-- JOIN public.job_cards jc ON jc.id = ro.job_card_id AND jc.shop_id = ro.shop_id
-- WHERE ro.ro_number = 'RO-00017' AND ro.shop_id = '<reviewed-shop-uuid>';
