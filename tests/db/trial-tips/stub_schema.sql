-- Minimal stand-ins for the production tables the trial-tips migration reads.
-- ONLY for the throwaway container started by tests/db/run-trial-tips-db-tests.mjs.
--
-- auth.users comes from the Supabase Postgres image itself (email,
-- email_confirmed_at, as in production). profiles holds plan identity the way
-- production does (plan, trial_ends_at); shops/shop_users give the shop name.

-- NOTE: the local image's bootstrap auth.users predates GoTrue's own
-- migrations and has `confirmed_at` only. Hosted Supabase auth.users has
-- email_confirmed_at, which the app already reads
-- (lib/admin/profileDiagnostics.ts). The runner adds that column as the
-- image's superuser before this file runs; confirm it on the real schema at
-- staging.

CREATE TABLE public.shops (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
);

CREATE TABLE public.shop_users (
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role    TEXT NOT NULL DEFAULT 'owner',
  PRIMARY KEY (shop_id, user_id)
);

CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan          TEXT,
  trial_ends_at TIMESTAMPTZ
);
