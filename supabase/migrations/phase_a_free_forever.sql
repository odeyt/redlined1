-- ============================================================
-- phase_a_free_forever.sql
-- Phase A: Free Forever plan foundation.
-- Forward-only, safe for production. Idempotent.
-- ============================================================

-- 1. Fix the column default: new profiles get 'free', not 'starter'
ALTER TABLE public.profiles
  ALTER COLUMN plan SET DEFAULT 'free';

-- 2. Update handle_new_user trigger — new signups land on Free Forever
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role, plan, trial_ends_at, billing_status)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'Advisor'),
    'free',
    NULL,
    'free'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- 3. Fix existing users who got the bad 'starter' default with no active subscription.
--    Also downgrades users who were given 'trial' without a real trial end date.
--    Does NOT touch D1 internal shops (they're always treated as pro in app code).
UPDATE public.profiles AS p
SET
  plan           = 'free',
  trial_ends_at  = NULL,
  billing_status = 'free'
WHERE
  (p.plan = 'starter' OR p.plan = 'trial')
  AND (p.billing_status IS NULL OR p.billing_status IN ('inactive', 'trial'))
  AND p.id NOT IN (
    -- Exclude users with active paid subscriptions
    SELECT user_id FROM public.subscriptions
    WHERE status IN ('active', 'trialing')
    UNION
    SELECT su.user_id FROM public.shop_subscriptions ss
    JOIN public.shop_users su ON su.shop_id = ss.shop_id
    WHERE ss.status IN ('active', 'trialing')
      AND ss.plan_key NOT IN ('trial', 'free')
  );

-- 4. Create usage_monthly table for tracking Free plan usage limits
CREATE TABLE IF NOT EXISTS public.usage_monthly (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id      uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  year_month   char(7) NOT NULL,  -- 'YYYY-MM'
  metric       text NOT NULL,     -- 'completed_jobs' | 'ai_cases' | 'vin_lookups' | 'appointments' | 'dvi'
  count        integer NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, year_month, metric)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_usage_monthly_shop_month
  ON public.usage_monthly (shop_id, year_month);

-- RLS: shop members can read their own usage; service role handles writes
ALTER TABLE public.usage_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_members_read_usage" ON public.usage_monthly
  FOR SELECT USING (
    shop_id IN (
      SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid()
    )
  );

-- Service role bypasses RLS for server-side writes (INSERT/UPDATE from API routes)
-- No INSERT policy needed — app uses service-role client (getAdminDb) for writes

-- 5. Function: atomically increment a monthly usage counter
--    Returns the new count after increment.
CREATE OR REPLACE FUNCTION increment_usage_monthly(
  p_shop_id   uuid,
  p_metric    text,
  p_year_month char(7) DEFAULT to_char(now(), 'YYYY-MM')
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.usage_monthly (shop_id, year_month, metric, count, updated_at)
  VALUES (p_shop_id, p_year_month, p_metric, 1, now())
  ON CONFLICT (shop_id, year_month, metric)
  DO UPDATE SET count = usage_monthly.count + 1, updated_at = now()
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;
