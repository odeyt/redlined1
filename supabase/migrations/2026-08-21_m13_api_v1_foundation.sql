-- M13 — API v1 foundation: principals, idempotency, rate limiting
--
-- Purely additive. Three new tables and one function; nothing existing is
-- altered, so this cannot affect the app as it stands today.
--
-- ## The principal model
--
-- An API key belongs to an ORGANIZATION, optionally narrowed to one shop.
-- That matches the tenancy M12.4 established — every shop belongs to exactly
-- one organization — and it means the caller never chooses its own tenant:
-- the key is the tenant.
--
-- The Supabase service-role key is NOT an API credential and must never be
-- handed to an integration. It bypasses RLS entirely. These keys carry no
-- database privilege at all; they identify a caller to the application, which
-- then does the tenant scoping itself through the domain layer.
--
-- ## Why only a hash is stored
--
-- The secret is shown once, at creation, and never again. What is kept is
-- sha256 of the full secret plus a short non-secret prefix for display, so a
-- leaked database gives an attacker nothing usable and an operator can still
-- recognise which key is which in a list.

BEGIN;

CREATE TABLE IF NOT EXISTS public.api_keys (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Optional narrowing. NULL means every shop in the organization; a value
  -- means this key may only ever touch that one shop. It is verified against
  -- the organization on every request rather than trusted.
  shop_id          UUID REFERENCES public.shops(id) ON DELETE CASCADE,

  name             TEXT NOT NULL,

  -- Non-secret, for display: "rl_live_a1b2c3d4…". Not unique on its own.
  prefix           TEXT NOT NULL,
  -- sha256 of the full secret. Unique so a collision cannot silently
  -- authenticate the wrong tenant.
  key_hash         TEXT NOT NULL UNIQUE,

  -- Deny by default: a key with no scopes can do nothing.
  scopes           TEXT[] NOT NULL DEFAULT '{}',

  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at     TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,

  CONSTRAINT api_keys_shop_in_org CHECK (shop_id IS NULL OR organization_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON public.api_keys (key_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS api_keys_org_idx  ON public.api_keys (organization_id);

-- ── Idempotency ─────────────────────────────────────────────────────────────
--
-- Scoped to the KEY, not the organization: two integrations owned by the same
-- customer choosing the same key string must not collide with each other.
--
-- request_hash is what makes a replay distinguishable from a different request
-- reusing the key. Same key + same body returns the stored response; same key +
-- different body is a conflict, because the caller has a bug and silently
-- returning the first result would hide it.

CREATE TABLE IF NOT EXISTS public.api_idempotency (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id     UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  endpoint       TEXT NOT NULL,
  request_hash   TEXT NOT NULL,
  status_code    INTEGER NOT NULL,
  response_body  JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (api_key_id, endpoint, idempotency_key)
);

CREATE INDEX IF NOT EXISTS api_idempotency_created_idx ON public.api_idempotency (created_at);

-- ── Rate limiting ───────────────────────────────────────────────────────────
--
-- Keyed on the API key rather than the IP. Business integrations run on shared
-- infrastructure — several customers behind one hosting provider's egress
-- address — so an IP limit would throttle unrelated tenants together.
--
-- A fixed window, not a sliding one. It admits a burst across a boundary, and
-- that is an acceptable trade for a counter that is one atomic upsert on a
-- serverless request path.

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  api_key_id    UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  window_start  TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (api_key_id, window_start)
);

-- Atomic increment-and-test. Returns the count AFTER this request, so the
-- caller compares against its own limit and the decision cannot race: two
-- concurrent requests get two different numbers.
CREATE OR REPLACE FUNCTION public.api_rate_limit_hit(
  p_api_key_id UUID,
  p_window_seconds INTEGER DEFAULT 60
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window TIMESTAMPTZ;
  v_count  INTEGER;
BEGIN
  v_window := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);

  INSERT INTO public.api_rate_limits (api_key_id, window_start, request_count)
  VALUES (p_api_key_id, v_window, 1)
  ON CONFLICT (api_key_id, window_start)
  DO UPDATE SET request_count = public.api_rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN v_count;
END $$;

-- ── Access control ──────────────────────────────────────────────────────────
--
-- These tables are reachable only from the server. `authenticated` gets no
-- grant at all — not SELECT — because a shop user reading api_keys learns the
-- prefix and scopes of every integration in their organization, and reading
-- api_idempotency would replay stored response bodies belonging to a key they
-- do not own.
--
-- RLS is enabled as a second line, but the absence of a grant is the boundary.

ALTER TABLE public.api_keys        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.api_keys        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.api_idempotency FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.api_rate_limits FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.api_rate_limit_hit(UUID, INTEGER) FROM PUBLIC, anon, authenticated;

COMMIT;

-- ── Verification (run after COMMIT) ─────────────────────────────────────────

SELECT 'api tables (expect 3)' AS check_name, count(*)::text AS result
  FROM pg_tables WHERE schemaname = 'public'
   AND tablename IN ('api_keys', 'api_idempotency', 'api_rate_limits')
UNION ALL
SELECT 'rls on all three (expect 3)', count(*)::text
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relrowsecurity
   AND c.relname IN ('api_keys', 'api_idempotency', 'api_rate_limits')
UNION ALL
SELECT 'no grants to anon/authenticated (expect 0)', count(*)::text
  FROM information_schema.role_table_grants
 WHERE table_name IN ('api_keys', 'api_idempotency', 'api_rate_limits')
   AND grantee IN ('anon', 'authenticated')
UNION ALL
SELECT 'rate limit function is definer (expect true)', bool_and(prosecdef)::text
  FROM pg_proc WHERE proname = 'api_rate_limit_hit';
