-- Minimal stand-ins for the production tables the reminders migration
-- depends on. ONLY for the throwaway local container used by
-- tests/db/run-reminders-db-tests.mjs — never run this anywhere else.
--
-- This proves the migration's own logic (RLS, triggers, cap, flag, history).
-- It does NOT prove compatibility with the full production schema: the
-- repository cannot rebuild that locally (see the runner's header).
--
-- Column types match production where the migration relies on them:
-- customers.id and job_cards.id are TEXT, vehicles.id is UUID, shop_users is
-- (shop_id, user_id, role), plan identity is profiles.plan + trial_ends_at.
-- shop_users gets the same "see your own memberships" RLS the app relies on,
-- because the reminders policies read it as the calling user.

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
ALTER TABLE public.shop_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY shop_users_own ON public.shop_users
  FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON public.shop_users TO authenticated;

CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan          TEXT,
  trial_ends_at TIMESTAMPTZ
);

CREATE TABLE public.customers (
  id      TEXT PRIMARY KEY,
  shop_id UUID REFERENCES public.shops(id),
  name    TEXT
);

CREATE TABLE public.vehicles (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES public.shops(id),
  label   TEXT
);

CREATE TABLE public.job_cards (
  id      TEXT PRIMARY KEY,
  shop_id UUID REFERENCES public.shops(id),
  status  TEXT
);

-- Columns and unique index as supabase/migration_feature_flags.sql defines them.
CREATE TABLE public.feature_flags (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key      text        NOT NULL,
  display_name  text        NOT NULL DEFAULT '',
  description   text        NOT NULL DEFAULT '',
  enabled       boolean     NOT NULL DEFAULT false,
  scope         text        NOT NULL DEFAULT 'global',
  shop_id       uuid,
  user_id       uuid,
  role          text,
  environment   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX feature_flags_unique_scope
  ON public.feature_flags (
    flag_key, scope,
    COALESCE(shop_id::text, ''), COALESCE(user_id::text, ''),
    COALESCE(role, ''), COALESCE(environment, '')
  );
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
