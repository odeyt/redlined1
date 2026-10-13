-- Customer portal bearer tokens.
--
-- The portal (/portal/[token]) and its estimate action route resolved a link
-- through customers.portal_token. Production has no such column (verified
-- 2026-10-13 from the API schema and by the owner from information_schema and
-- pg_attribute), so every portal link resolved to nothing and the staff
-- "copy portal link" button never appeared.
--
-- Tokens live in their own table, not on customers:
--   - Staff screens read customers with select('*'). A column there would send
--     every customer's link to the browser in every list response.
--   - Nothing but the server's service role can read this table: RLS on with
--     no policies, and every grant to PUBLIC, anon and authenticated revoked.
--     Policies alone would not do it — Supabase may grant anon/authenticated
--     all privileges on new public tables by default.
--
-- Token: 64 lowercase hex characters from two gen_random_uuid() values, i.e.
-- 244 random bits from Postgres's strong random source (pg_strong_random). It
-- is built in, so this migration does not depend on pgcrypto being enabled.
-- Never derived from ids, names or time.
--
-- Provisioning:
--   - Every existing customer gets a token now (backfill). A customer that
--     already has one keeps it, so re-running this file changes nothing.
--   - Every new customer gets one from an AFTER INSERT trigger, whichever path
--     created it (staff screens, triage, invoice quick-add, imports, API).
--   - The trigger never blocks a customer save: on any failure it raises a
--     WARNING and the customer is still created. The staff link route
--     provisions a missing token on first use.
--
-- Uniqueness: a unique index on token. A collision at 244 bits is not a
-- practical concern; if one ever occurred the backfill transaction would abort
-- and change nothing, and could simply be re-run.
--
-- Rollback: 2026-10-13_customer_portal_tokens_rollback.sql. Rolling back
-- deletes every token, which invalidates any link already given to a customer;
-- once links are in use, close the portal path in proxy.ts instead.

BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.customers') IS NULL THEN
    RAISE EXCEPTION 'public.customers is missing. Nothing was changed.';
  END IF;
  IF (SELECT format_type(a.atttypid, a.atttypmod)
        FROM pg_attribute a
       WHERE a.attrelid = 'public.customers'::regclass AND a.attname = 'id' AND NOT a.attisdropped) IS DISTINCT FROM 'text' THEN
    RAISE EXCEPTION 'public.customers.id is not text; this migration expects text ids. Nothing was changed.';
  END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS public.customer_portal_tokens (
  customer_id TEXT PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customer_portal_tokens_token_format CHECK (token ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_portal_tokens_token_key
  ON public.customer_portal_tokens (token);

COMMENT ON TABLE public.customer_portal_tokens IS
  'Bearer tokens for /portal/[token]. Service role only: RLS on, no policies, no anon/authenticated grants.';

ALTER TABLE public.customer_portal_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_portal_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_portal_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.new_customer_portal_token()
RETURNS TEXT
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog
AS $$
  SELECT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

REVOKE ALL ON FUNCTION public.new_customer_portal_token() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.new_customer_portal_token() TO service_role;

-- SECURITY DEFINER: staff insert customers as `authenticated`, which has no
-- access to the token table. search_path is pinned so the definer cannot be
-- redirected to another schema's objects.
CREATE OR REPLACE FUNCTION public.provision_customer_portal_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  BEGIN
    INSERT INTO public.customer_portal_tokens (customer_id, token)
    VALUES (NEW.id, public.new_customer_portal_token())
    ON CONFLICT (customer_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Never block a customer save. The id is logged; the token is not.
    RAISE WARNING 'customer % saved without a portal token: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.provision_customer_portal_token() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS customers_provision_portal_token ON public.customers;
CREATE TRIGGER customers_provision_portal_token
  AFTER INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.provision_customer_portal_token();

-- Backfill. Keeps any token a customer already has.
INSERT INTO public.customer_portal_tokens (customer_id, token)
SELECT c.id, public.new_customer_portal_token()
  FROM public.customers c
ON CONFLICT (customer_id) DO NOTHING;

COMMIT;
