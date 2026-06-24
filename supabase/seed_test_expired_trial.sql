-- ─────────────────────────────────────────────────────────────────
-- TEST ACCOUNT: Expired Trial
-- Purpose : Verify plan-gate locks all modules except Dashboard,
--           Settings, and Plans & Gates after trial expires.
-- Run in  : Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────

-- Step 1 — Create the auth user (skip if account already exists)
-- You can also do this via Dashboard → Authentication → Users → Invite user
-- then run only Step 2 below to expire their trial.

-- Step 2 — Expire the trial on an existing account by email
-- Replace 'testexpired@redlined1.com' with the actual test email.
UPDATE public.profiles
SET
  plan          = 'trial',
  trial_ends_at = now() - INTERVAL '1 day'   -- expired yesterday
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'testexpired@redlined1.com'
);

-- Confirm the update
SELECT
  u.email,
  p.plan,
  p.trial_ends_at,
  CASE
    WHEN p.plan = 'pro'                                      THEN 'pro'
    WHEN p.trial_ends_at IS NOT NULL
         AND p.trial_ends_at > now()                         THEN 'trial (active)'
    ELSE                                                          'free (expired)'
  END AS effective_status
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE u.email = 'testexpired@redlined1.com';

-- ─────────────────────────────────────────────────────────────────
-- To RESET the test account back to active trial (undo):
-- ─────────────────────────────────────────────────────────────────
-- UPDATE public.profiles
-- SET trial_ends_at = now() + INTERVAL '7 days'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'testexpired@redlined1.com');
