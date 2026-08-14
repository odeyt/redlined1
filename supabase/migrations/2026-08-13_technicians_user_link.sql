-- Link a technician record to the account that person signs in with.
--
-- RUN AGAINST redlined1, on its own.
--
-- Why this is needed at all: job_cards.technicians stores NAMES
-- (["Beck","Don","yoeun"]), and technicians has no reference to any login. So
-- "this job is assigned to Beck" cannot currently be turned into "tell Beck",
-- because nothing connects the two. Measured 2026-08-13: 25 technician
-- records, 3 with an email, 1 whose email matches a login, and no shop_users
-- row anywhere with the technician role.
--
-- That is why job.assigned and job.work_added are still marked "not sending
-- yet" in the alert catalogue. This migration is the missing half; the trigger
-- at the bottom is the other.
--
-- Safe: additive, nullable. An unlinked technician behaves exactly as today —
-- they simply receive nothing, which is what happens now.

BEGIN;

ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS user_id UUID;

CREATE INDEX IF NOT EXISTS technicians_user_idx
  ON public.technicians(user_id) WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.technicians.user_id IS
  'The auth user this technician signs in as, or NULL if they have no login. Set from the Employees screen. Used to address job alerts to a person; an unlinked technician receives none.';

-- ── Job assigned ────────────────────────────────────────────────────────────
--
-- Fires per newly added name, so adding one technician to a job with three
-- does not alert the two who were already on it.
--
-- Names are matched within the shop, which is the join the data model allows.
-- It is imperfect — two people called "Don" at one location would both be
-- told — but it is the same assumption the job card itself makes, and
-- inventing a stricter rule here would only disagree with what the screen
-- shows. An unmatched or unlinked name is skipped silently: no login, no
-- alert, nothing broken.
CREATE OR REPLACE FUNCTION public.alert_job_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  added   TEXT;
  target  UUID;
BEGIN
  -- to_jsonb on both sides, so this works whether technicians is text[] or
  -- jsonb — the column reads as an array through the API either way, and a
  -- migration that guesses wrong aborts the whole file.
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
      INSERT INTO public.alert_events
        (shop_id, event_type, target_user_id, title, body, entity_type, entity_id, created_by)
      VALUES
        (NEW.shop_id, 'job.assigned', target,
         'You have been assigned ' || COALESCE(NEW.id::text, 'a job'),
         COALESCE(NEW.customer, '') || CASE WHEN NEW.vehicle IS NULL THEN '' ELSE ' · ' || NEW.vehicle END,
         -- job_cards.id is text ('JC-1784537040284'), which is why
         -- alert_events.entity_id is text rather than uuid.
         'job_card', NEW.id::text, auth.uid());
    END IF;
  END LOOP;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS job_cards_alert_assigned ON public.job_cards;
CREATE TRIGGER job_cards_alert_assigned
  AFTER UPDATE ON public.job_cards
  FOR EACH ROW EXECUTE FUNCTION public.alert_job_assigned();

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Verification ────────────────────────────────────────────────────────────
--
-- Column exists:
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_name = 'technicians' AND column_name = 'user_id';
--
-- Trigger attached:
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.job_cards'::regclass AND NOT tgisinternal;
--
-- End to end, once a technician is linked in the Employees screen: add them to
-- a job card, then
--   SELECT event_type, title, target_user_id, created_at
--   FROM public.alert_events WHERE event_type = 'job.assigned'
--   ORDER BY created_at DESC LIMIT 5;
--
-- Nobody linked yet? Then this correctly produces nothing:
--   SELECT count(*) FROM public.technicians WHERE user_id IS NOT NULL;
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   DROP TRIGGER IF EXISTS job_cards_alert_assigned ON public.job_cards;
--   DROP FUNCTION IF EXISTS public.alert_job_assigned();
--   ALTER TABLE public.technicians DROP COLUMN user_id;   -- discards the links
