-- ===========================================================================
-- shop_audit_leads — inbound requests from the Book a Shop Audit funnel
--
-- NOT YET APPLIED. Run in the Supabase SQL Editor after review.
--
-- WHY
-- ---
-- /contact-sales today sends an email through Resend and stores nothing. A
-- Resend outage, a bounced address or a mistyped recipient loses the lead with
-- no record it ever arrived. This table is the record; the notification is the
-- convenience on top of it, which is why the endpoint writes here first and
-- treats a failed email as non-fatal.
--
-- SECURITY MODEL
-- --------------
-- Submissions arrive from anonymous visitors, so the write has to be possible
-- without a session — but nothing about these rows may be readable by the
-- public. RLS is enabled with NO policy for anon or authenticated, which under
-- Postgres denies all four commands to both roles by default. The API route
-- inserts with the service role, which bypasses RLS.
--
-- That means: anon cannot select, insert, update or delete here directly, even
-- with the public anon key. The only way in is the server endpoint, which
-- validates and rate-limits first. Deliberately no anon INSERT policy — an
-- insert policy would let anyone write rows straight to PostgREST at whatever
-- volume they liked, bypassing every check the route performs.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.shop_audit_leads (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  full_name                TEXT NOT NULL,
  email                    TEXT NOT NULL,
  phone                    TEXT,
  shop_name                TEXT,
  country                  TEXT,

  location_count           INTEGER,
  technician_count         INTEGER,
  monthly_vehicle_volume   INTEGER,

  current_software         TEXT,
  biggest_challenge        TEXT,
  preferred_contact_method TEXT,
  preferred_time           TEXT,

  -- Attribution. Recorded server-side from the submitted payload; never
  -- trusted for anything but reporting.
  source                   TEXT,
  utm_source               TEXT,
  utm_medium               TEXT,
  utm_campaign             TEXT,

  -- Sales workflow state. Constrained rather than free text so a status
  -- filter cannot silently miss rows because of a typo.
  status                   TEXT NOT NULL DEFAULT 'new',

  CONSTRAINT shop_audit_leads_status_check
    CHECK (status IN ('new', 'contacted', 'qualified', 'scheduled', 'won', 'lost', 'spam')),

  -- Cheap integrity guards. The route validates too; these stop anything that
  -- reaches the table another way from storing nonsense.
  CONSTRAINT shop_audit_leads_email_shape   CHECK (position('@' in email) > 1),
  CONSTRAINT shop_audit_leads_counts_sane   CHECK (
    (location_count         IS NULL OR location_count         BETWEEN 0 AND 10000) AND
    (technician_count       IS NULL OR technician_count       BETWEEN 0 AND 10000) AND
    (monthly_vehicle_volume IS NULL OR monthly_vehicle_volume BETWEEN 0 AND 1000000)
  )
);

-- The two questions this table gets asked: what came in recently, and what is
-- still unworked.
CREATE INDEX IF NOT EXISTS shop_audit_leads_created_idx
  ON public.shop_audit_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS shop_audit_leads_status_idx
  ON public.shop_audit_leads (status, created_at DESC);

ALTER TABLE public.shop_audit_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_audit_leads FORCE ROW LEVEL SECURITY;

-- No policies, by design — see SECURITY MODEL above. Revoke the blanket grants
-- Supabase hands these two roles as well, so a future accidental
-- "DISABLE ROW LEVEL SECURITY" does not silently expose the table the way it
-- once did for shops/shop_users.
REVOKE ALL ON public.shop_audit_leads FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- VERIFY (read-only)
--   rls_enabled and rls_forced both true; zero policies; zero anon/authenticated
--   grants.
-- ---------------------------------------------------------------------------
-- SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
-- FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public' AND c.relname = 'shop_audit_leads';
--
-- SELECT policyname FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'shop_audit_leads';
--
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND table_name = 'shop_audit_leads'
--   AND grantee IN ('anon','authenticated');
--
-- ROLLBACK: DROP TABLE IF EXISTS public.shop_audit_leads;
