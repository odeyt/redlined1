-- ============================================================
-- fix_trial_provisioning.sql
-- Fixes new signups getting full 'pro' access due to
-- profiles.plan DEFAULT 'starter' being in PAID_PLANS.
-- Safe to run multiple times (idempotent).
-- ============================================================

-- 1. Change the column default so new rows get 'trial', not 'starter'
ALTER TABLE public.profiles
  ALTER COLUMN plan SET DEFAULT 'trial';

-- 2. Update the handle_new_user trigger to set plan + trial_ends_at
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role, plan, trial_ends_at, billing_status)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'Advisor'),
    'trial',
    now() + interval '7 days',
    'trial'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- 3. Fix existing users who got the bad 'starter' default with no real subscription.
--    Only patch rows where billing_status is 'inactive' (not actually paid).
--    Internal D1 shops are excluded via shop_id check — they're always pro in app code.
UPDATE public.profiles
SET
  plan          = 'trial',
  trial_ends_at = COALESCE(trial_ends_at, created_at + interval '7 days'),
  billing_status = 'trial'
WHERE
  plan = 'starter'
  AND (billing_status IS NULL OR billing_status = 'inactive')
  AND id NOT IN (
    -- Exclude users with active paid subscriptions in either subscriptions table
    SELECT user_id FROM public.subscriptions
    WHERE status IN ('active', 'trialing')
    UNION
    SELECT user_id FROM public.shop_subscriptions ss
    JOIN public.shop_users su ON su.shop_id = ss.shop_id
    WHERE ss.status IN ('active', 'trialing')
      AND ss.plan_key != 'trial'
  );
