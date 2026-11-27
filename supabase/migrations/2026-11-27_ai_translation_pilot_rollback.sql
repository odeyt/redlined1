-- Rollback for 2026-11-27_ai_translation_pilot.sql.
--
-- FIRST, prefer the off switch: Settings → Feature Flags → ai_translation OFF.
-- The 🌐 button goes back to the old translator at once and the usage
-- history is kept.
--
-- This file removes only what that migration added: the ai_translation flag
-- rows and the ai_usage_events table. That table holds only the AI pilot's
-- own call log (tokens and cost) — no business data. It refuses to drop the
-- table if it holds rows, so a usage history is never lost by accident;
-- delete those rows deliberately first if you really mean to.

BEGIN;

DELETE FROM feature_flags WHERE flag_key = 'ai_translation';

DO $guard$
BEGIN
  IF to_regclass('public.ai_usage_events') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.ai_usage_events) THEN
    RAISE EXCEPTION 'ai_usage_events has rows; not dropping it. Turn the flag off instead, or delete the rows deliberately first.';
  END IF;
END
$guard$;

DROP TABLE IF EXISTS public.ai_usage_events;

COMMIT;

notify pgrst, 'reload schema';
