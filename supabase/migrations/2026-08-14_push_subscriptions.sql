-- Where to send a push when the app is closed.
--
-- RUN AGAINST redlined1, on its own.
--
-- One row per device per user. A person with a phone and a desk computer has
-- two, and both should ring — which is the whole point of push over a toast.
--
-- The endpoint URL is the address the browser vendor gives us, and it is the
-- natural key: re-subscribing on the same device returns the same endpoint, so
-- upsert on it rather than accumulating dead rows every time the app reloads.

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  shop_id     UUID NOT NULL,
  -- Push service URL for this device. Unique so a device re-subscribing
  -- replaces its row instead of adding another.
  endpoint    TEXT NOT NULL UNIQUE,
  -- Encryption material from the browser. Without these a push cannot be
  -- delivered, only counted.
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.push_subscriptions'::regclass) THEN
    RAISE EXCEPTION 'RLS did not enable on push_subscriptions';
  END IF;
END $$;

-- A person may see and remove their own devices, and nobody else's. There is
-- no shop-wide read: a subscription is a route to somebody's personal phone,
-- not shop data, and an owner has no reason to enumerate their staff's
-- devices.
DROP POLICY IF EXISTS push_subscriptions_own_select ON public.push_subscriptions;
CREATE POLICY push_subscriptions_own_select ON public.push_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_subscriptions_own_delete ON public.push_subscriptions;
CREATE POLICY push_subscriptions_own_delete ON public.push_subscriptions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Writes go through the server route, which takes user_id from the verified
-- session rather than the request body. No INSERT policy for clients: a
-- client that could insert could register a device against someone else's
-- user_id and receive their alerts.
GRANT SELECT, DELETE ON public.push_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Verification ────────────────────────────────────────────────────────────
--   SELECT count(*) FROM public.push_subscriptions;              -- 0 to start
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'push_subscriptions' AND grantee = 'anon';  -- zero rows
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS public.push_subscriptions;
--   Every device then has to re-enable notifications.
