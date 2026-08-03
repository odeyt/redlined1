-- Let a new signup keep the trial that handle_new_user grants it.
--
-- Two triggers fire on a new profile row and disagree:
--
--   handle_new_user (on auth.users)  inserts plan 'trial' with NOW() + 7 days
--   profiles_default_free (BEFORE INSERT on profiles)  rewrites that to 'free'
--                                    and nulls trial_ends_at
--
-- profiles_default_free was correct when Free Forever was the model: it existed
-- to neutralise a legacy 'trial' default that nothing honoured. On 2026-08-03
-- the decision changed — a new account now gets 7 days with every module
-- unlocked, lapsing to Free Forever — and this trigger is what prevents it.
--
-- Dropping it makes handle_new_user authoritative, which is what the
-- application already expects: ensureInitialPlan settles the columns, and
-- getPlanStatus reads an unexpired trial_ends_at as a trial.
--
-- ── What this does NOT change ──────────────────────────────────────────────
--
-- Free Forever still arrives, just at the end of the trial rather than at
-- signup: ensureInitialPlan sets plan 'free' and CLEARS trial_ends_at when the
-- date passes. That clearing is what stops a second trial — a null date is
-- never a trial — so removing this trigger does not open a way to farm trials
-- by signing in repeatedly.
--
-- Existing rows are untouched. Paid plans were never affected by this trigger
-- (its IF matched only NULL and 'trial'), and are not affected now.
--
-- The function is left in place rather than dropped, so the behaviour can be
-- restored by recreating the trigger alone if the trial is ever withdrawn.

BEGIN;

DROP TRIGGER IF EXISTS profiles_default_free ON public.profiles;

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────────
--
-- 1. Only handle_new_user should now shape a new profile. Expect the
--    profiles_default_free row to be gone.
--
--   SELECT t.tgname, p.proname
--   FROM pg_trigger t
--   JOIN pg_class c ON c.oid = t.tgrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   JOIN pg_proc p ON p.oid = t.tgfoid
--   WHERE n.nspname = 'public' AND c.relname = 'profiles' AND NOT t.tgisinternal;
--
-- 2. After the next real signup, that account should read as a trial:
--
--   SELECT email, plan, trial_ends_at
--   FROM public.profiles
--   ORDER BY created_at DESC
--   LIMIT 3;
--
--    Expect plan = 'trial' and trial_ends_at roughly seven days out. Before
--    this migration it read 'free'.
