-- Minimal stand-ins for the tables free_tier_usage_limits.sql touches.
-- ONLY for the throwaway container used by tests/db/run-free-tier-db-tests.mjs.
-- Does not prove compatibility with the full production schema.
CREATE TABLE public.shops (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL);
CREATE TABLE public.shop_users (
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner',
  PRIMARY KEY (shop_id, user_id)
);
CREATE TABLE public.profiles (id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, plan TEXT);
CREATE TABLE public.customers (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, shop_id UUID REFERENCES public.shops(id), name TEXT);
CREATE TABLE public.vehicles  (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), shop_id UUID REFERENCES public.shops(id), label TEXT);
CREATE TABLE public.job_cards (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, shop_id UUID REFERENCES public.shops(id),
                               check_in_date TIMESTAMPTZ NOT NULL DEFAULT now());
