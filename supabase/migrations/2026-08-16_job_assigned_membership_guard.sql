-- Do not write an alert nobody is allowed to read.
--
-- RUN AGAINST redlined1, on its own.
--
-- alert_job_assigned addresses the row to technicians.user_id. Nothing checked
-- that this user is a member of the shop the job belongs to — and the SELECT
-- policy on alert_events requires exactly that. So a technician linked in one
-- location and assigned a job in the other produced a row that existed,
-- counted, and was invisible to its recipient. No error anywhere: the alert
-- simply never arrived.
--
-- Found while testing cross-location assignment on 2026-08-16, where the same
-- person is linked at both locations but was a member of only one.
--
-- Two changes, both about not lying:
--   * membership is required before writing, so the row and the policy agree;
--   * a linked-but-unauthorised assignment is logged as a WARNING, because
--     silence is what made this hard to see in the first place.
--
-- Technicians who work at both locations still work: they need a shop_users
-- row per location, which is what "enable at both locations" means in this
-- system, and the Employees screen links them per location too.

BEGIN;

CREATE OR REPLACE FUNCTION public.alert_job_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  added   TEXT;
  target  UUID;
  is_member BOOLEAN;
BEGIN
  FOR added IN
    SELECT jsonb_array_elements_text(COALESCE(to_jsonb(NEW.technicians), '[]'::jsonb))
    EXCEPT
    SELECT jsonb_array_elements_text(COALESCE(to_jsonb(OLD.technicians), '[]'::jsonb))
  LOOP
    SELECT t.user_id INTO target
    FROM public.technicians t
    WHERE t.shop_id = NEW.shop_id
      AND t.name = added
      AND t.user_id IS NOT NULL
    LIMIT 1;

    IF target IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.shop_users su
        WHERE su.user_id = target AND su.shop_id = NEW.shop_id
      ) INTO is_member;

      IF is_member THEN
        INSERT INTO public.alert_events
          (shop_id, event_type, target_user_id, title, body, entity_type, entity_id, created_by)
        VALUES
          (NEW.shop_id, 'job.assigned', target,
           'You have been assigned ' || COALESCE(NEW.id::text, 'a job'),
           COALESCE(NEW.customer, '') || CASE WHEN NEW.vehicle IS NULL THEN '' ELSE ' · ' || NEW.vehicle END,
           'job_card', NEW.id::text, auth.uid());
      ELSE
        -- Linked, but with no membership of this shop, so alert_events'
        -- SELECT policy would hide the row from the very person it names.
        -- Writing it anyway would be a message addressed to somebody who can
        -- never open it.
        RAISE WARNING 'job.assigned skipped: % is linked in shop % but is not a member of it',
          added, NEW.shop_id;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $fn$;

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
--
-- Assign a linked technician to a job in a shop they belong to:
--   SELECT event_type, title, target_user_id FROM public.alert_events
--   WHERE event_type = 'job.assigned' ORDER BY created_at DESC LIMIT 3;
--
-- Every row's recipient can actually read it:
--   SELECT a.id
--   FROM public.alert_events a
--   LEFT JOIN public.shop_users su
--     ON su.user_id = a.target_user_id AND su.shop_id = a.shop_id
--   WHERE a.target_user_id IS NOT NULL AND su.user_id IS NULL;
--
-- Expect zero rows. Any row here is an alert its recipient cannot see.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
-- Re-apply the function body from
-- 2026-08-13_technicians_user_link.sql, which omits the membership check.
