-- Tell a technician when the job they are on changes underneath them.
--
-- RUN AGAINST redlined1, on its own.
--
-- "Work added" needed a definition before it could have a trigger, because
-- too narrow never fires and too broad alerts somebody every time a colleague
-- types. The definition chosen:
--
--   the scope or instructions changed on a job you are ALREADY on
--     service_type   the work itself
--     notes          instructions
--     labor_hours    how much work
--     parts_total    parts added to it
--
-- Deliberately NOT included: status, workflow stage, priority, next_action.
-- Those are progress and urgency, reported elsewhere; a technician does not
-- need a second alert because a card moved along a board.
--
-- Three exclusions, each of which would otherwise make this annoying enough
-- to be switched off:
--
--   1. Skip anyone added by THIS update. They get job.assigned instead, and
--      two notifications for one action reads as a bug.
--   2. Skip the person who made the change. Being told about your own edit is
--      noise, and it is the fastest way to teach someone to ignore alerts.
--   3. Require the same link-plus-membership as job.assigned, so this cannot
--      write a row its recipient is forbidden to read.

BEGIN;

CREATE OR REPLACE FUNCTION public.alert_job_work_added()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  who       TEXT;
  target    UUID;
  -- ARRAY[...] on every append, not a bare string literal. `changed || 'notes'`
  -- resolves to array || array, so Postgres parses the string as an array
  -- literal and raises 22P02 at RUNTIME — the function still compiles clean.
  changed   TEXT[] := ARRAY[]::TEXT[];
  summary   TEXT;
BEGIN
  -- What changed, in the recipient's language rather than column names.
  IF NEW.service_type IS DISTINCT FROM OLD.service_type THEN
    changed := changed || ARRAY['service'];
  END IF;
  IF COALESCE(NEW.notes, '') IS DISTINCT FROM COALESCE(OLD.notes, '')
     AND COALESCE(NEW.notes, '') <> '' THEN
    changed := changed || ARRAY['notes'];
  END IF;
  IF COALESCE(NEW.labor_hours, 0) IS DISTINCT FROM COALESCE(OLD.labor_hours, 0) THEN
    changed := changed || ARRAY['labour hours'];
  END IF;
  IF COALESCE(NEW.parts_total, 0) IS DISTINCT FROM COALESCE(OLD.parts_total, 0) THEN
    changed := changed || ARRAY['parts'];
  END IF;

  IF array_length(changed, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  summary := array_to_string(changed, ', ');

  -- Everyone on the card AFTER this update, minus anyone this update added —
  -- those are new assignments, and job.assigned covers them.
  FOR who IN
    SELECT jsonb_array_elements_text(COALESCE(to_jsonb(NEW.technicians), '[]'::jsonb))
    INTERSECT
    SELECT jsonb_array_elements_text(COALESCE(to_jsonb(OLD.technicians), '[]'::jsonb))
  LOOP
    SELECT t.user_id INTO target
    FROM public.technicians t
    WHERE t.shop_id = NEW.shop_id
      AND t.name = who
      AND t.user_id IS NOT NULL
    LIMIT 1;

    -- Not the person who just made the edit, and only somebody who can
    -- actually read the row once it exists.
    IF target IS NOT NULL
       AND target IS DISTINCT FROM auth.uid()
       AND EXISTS (
         SELECT 1 FROM public.shop_users su
         WHERE su.user_id = target AND su.shop_id = NEW.shop_id
       )
    THEN
      INSERT INTO public.alert_events
        (shop_id, event_type, target_user_id, title, body, entity_type, entity_id, created_by)
      VALUES
        (NEW.shop_id, 'job.work_added', target,
         NEW.id || ' updated — ' || summary,
         COALESCE(NEW.customer, '') || CASE WHEN NEW.vehicle IS NULL THEN '' ELSE ' · ' || NEW.vehicle END,
         'job_card', NEW.id, auth.uid());
    END IF;
  END LOOP;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS job_cards_alert_work_added ON public.job_cards;
CREATE TRIGGER job_cards_alert_work_added
  AFTER UPDATE ON public.job_cards
  FOR EACH ROW EXECUTE FUNCTION public.alert_job_work_added();

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
--
-- FIRST, before attaching anything to a live table: prove the function body
-- runs. PL/pgSQL does not type-check a body at CREATE time, so "Success. No
-- rows returned" means it parsed, not that it works — the first version of
-- this trigger passed that and then raised 22P02 on every job card edit.
-- DDL is transactional, so this proves it and leaves nothing behind:
--
--   BEGIN;
--   CREATE TRIGGER job_cards_alert_work_added
--     AFTER UPDATE ON public.job_cards
--     FOR EACH ROW EXECUTE FUNCTION public.alert_job_work_added();
--   UPDATE public.job_cards SET notes = 'trigger test' WHERE id = '<a card>';
--   SELECT event_type, title, target_user_id FROM public.alert_events
--     WHERE event_type = 'job.work_added';
--   ROLLBACK;
--
-- Both job_cards triggers attached:
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.job_cards'::regclass AND NOT tgisinternal;
--
-- Expect job_cards_alert_assigned and job_cards_alert_work_added.
--
-- Editing the notes on a card a linked technician is already on, as somebody
-- else, produces one row:
--   SELECT event_type, title, body FROM public.alert_events
--   WHERE event_type = 'job.work_added' ORDER BY created_at DESC LIMIT 3;
--
-- Adding a NEW technician in the same edit must produce job.assigned for them
-- and NOT job.work_added — check both types after such an edit.
--
-- Editing your own card notifies nobody, because the only recipient would be
-- you.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   DROP TRIGGER IF EXISTS job_cards_alert_work_added ON public.job_cards;
--   DROP FUNCTION IF EXISTS public.alert_job_work_added();
