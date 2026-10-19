-- WhatsApp Business (Meta Cloud API, coexistence) — storage.
--
-- Additive only: six new tables, one trigger function, one feature-flag row.
-- Nothing existing is altered, no row anywhere else is changed, and nothing
-- here sends a message or contacts Meta. Safe to re-run.
--
-- Tables (all SERVICE ROLE ONLY — RLS on with no policies, every grant to
-- PUBLIC/anon/authenticated revoked; staff reach them only through the
-- /api/whatsapp/* routes, which check shop membership and role first):
--
--   whatsapp_connections        one row per shop = the single connection for
--                               the merged D1 Imports shop. Master switch,
--                               sandbox/live mode, Meta ids, owner attestations.
--   whatsapp_connection_secrets the Cloud API access token, AES-256-GCM
--                               encrypted by the app (key in server env, never
--                               in the database).
--   whatsapp_templates          approval status of each template per language,
--                               synced from Meta.
--   whatsapp_consents           current opt-in / opt-out per WhatsApp number.
--   whatsapp_consent_events     append-only history of every consent change.
--   whatsapp_messages           every send attempt: delivery status, wamid,
--                               duplicate-prevention key.
--
-- Why service role only: these hold customer phone numbers, consent records and
-- (encrypted) provider credentials. Supabase may grant anon/authenticated all
-- privileges on new public tables by default, so the grants are revoked
-- explicitly, as in 2026-10-13_customer_portal_tokens.sql.
--
-- Guard rails in the schema itself, not only in app code:
--   - mode = 'live' is impossible without a recorded owner approval AND a
--     coexistence onboarding (CHECK whatsapp_connections_live_needs_approval).
--   - a duplicate of a message that was not a failure is impossible
--     (unique partial index on dedupe_key).
--   - the same client request cannot create two sends (unique client_request_id).
--   - consent history cannot be edited or deleted (trigger + grants).
--
-- Flag: seeds `whatsapp_business` for the merged D1 Imports shop, DISABLED.
--
-- Rollback: 2026-10-19_whatsapp_business_rollback.sql (drops these tables,
-- which deletes consent and delivery history — export first if any exist).

BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.shops') IS NULL THEN
    RAISE EXCEPTION 'public.shops is missing. Nothing was changed.';
  END IF;
  IF (SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a
       WHERE a.attrelid = 'public.shops'::regclass AND a.attname = 'id' AND NOT a.attisdropped) IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'public.shops.id is not uuid. Nothing was changed.';
  END IF;
END
$guard$;

-- ── Connection ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
  shop_id                  UUID PRIMARY KEY REFERENCES public.shops(id),
  status                   TEXT NOT NULL DEFAULT 'not_connected'
                             CHECK (status IN ('not_connected', 'connected', 'needs_attention', 'disconnected')),
  mode                     TEXT NOT NULL DEFAULT 'sandbox' CHECK (mode IN ('sandbox', 'live')),
  onboarding_type          TEXT CHECK (onboarding_type IN ('coexistence', 'sandbox_test_number')),
  enabled                  BOOLEAN NOT NULL DEFAULT false,
  automations_enabled      BOOLEAN NOT NULL DEFAULT false,
  automation_settings      JSONB NOT NULL DEFAULT '{}'::jsonb,
  waba_id                  TEXT,
  phone_number_id          TEXT UNIQUE,
  business_id              TEXT,
  display_phone_number     TEXT,
  verified_name            TEXT,
  quality_rating           TEXT,
  messaging_limit_tier     TEXT,
  platform_type            TEXT,
  is_on_biz_app            BOOLEAN,
  code_verification_status TEXT,
  name_status              TEXT,
  business_phone_digits    TEXT CHECK (business_phone_digits IS NULL OR business_phone_digits ~ '^[1-9][0-9]{7,14}$'),
  attestations             JSONB NOT NULL DEFAULT '{}'::jsonb,
  attested_by              UUID,
  attested_at              TIMESTAMPTZ,
  sandbox_recipients       TEXT[] NOT NULL DEFAULT '{}',
  live_approved_by         UUID,
  live_approved_at         TIMESTAMPTZ,
  webhook_verified_at      TIMESTAMPTZ,
  last_verified_at         TIMESTAMPTZ,
  last_account_event       TEXT,
  last_account_event_at    TIMESTAMPTZ,
  connected_by             UUID,
  connected_at             TIMESTAMPTZ,
  updated_by               UUID,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_connections_live_needs_approval
    CHECK (mode <> 'live' OR (live_approved_at IS NOT NULL AND live_approved_by IS NOT NULL AND onboarding_type = 'coexistence')),
  CONSTRAINT whatsapp_connections_sandbox_recipients_max
    CHECK (cardinality(sandbox_recipients) <= 5)
);

COMMENT ON TABLE public.whatsapp_connections IS
  'One WhatsApp Cloud API connection per shop (D1 Imports pilot). Service role only.';

CREATE TABLE IF NOT EXISTS public.whatsapp_connection_secrets (
  shop_id          UUID PRIMARY KEY REFERENCES public.whatsapp_connections(shop_id) ON DELETE CASCADE,
  access_token_enc TEXT NOT NULL CHECK (access_token_enc LIKE 'v1:%'),
  token_kind       TEXT NOT NULL CHECK (token_kind IN ('business_token', 'system_user', 'sandbox_temporary')),
  token_expires_at TIMESTAMPTZ,
  updated_by       UUID,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.whatsapp_connection_secrets IS
  'App-encrypted Cloud API access token. Service role only. Never selected outside the send/verify paths.';

-- ── Templates ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  shop_id          UUID NOT NULL REFERENCES public.whatsapp_connections(shop_id) ON DELETE CASCADE,
  name             TEXT NOT NULL CHECK (name ~ '^[a-z0-9_]{1,512}$'),
  language         TEXT NOT NULL CHECK (language ~ '^[a-z]{2}(_[A-Z]{2})?$'),
  status           TEXT NOT NULL DEFAULT 'NOT_SUBMITTED',
  category         TEXT,
  meta_template_id TEXT,
  rejected_reason  TEXT,
  submitted_by     UUID,
  submitted_at     TIMESTAMPTZ,
  last_synced_at   TIMESTAMPTZ,
  PRIMARY KEY (shop_id, name, language)
);

-- ── Consent ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_consents (
  shop_id      UUID NOT NULL REFERENCES public.shops(id),
  phone_digits TEXT NOT NULL CHECK (phone_digits ~ '^[1-9][0-9]{7,14}$'),
  status       TEXT NOT NULL CHECK (status IN ('opted_in', 'opted_out')),
  customer_id  TEXT,
  source       TEXT NOT NULL CHECK (source IN ('staff_verbal', 'staff_written', 'customer_form', 'inbound_keyword', 'staff_opt_out')),
  note         TEXT CHECK (note IS NULL OR length(note) <= 500),
  recorded_by  UUID,
  opted_in_at  TIMESTAMPTZ,
  opted_out_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, phone_digits)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_consent_events (
  id           BIGSERIAL PRIMARY KEY,
  shop_id      UUID NOT NULL,
  phone_digits TEXT NOT NULL,
  customer_id  TEXT,
  status       TEXT NOT NULL CHECK (status IN ('opted_in', 'opted_out')),
  source       TEXT NOT NULL,
  note         TEXT,
  recorded_by  UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_consent_events_phone_idx
  ON public.whatsapp_consent_events (shop_id, phone_digits, created_at DESC);

CREATE OR REPLACE FUNCTION public.whatsapp_consent_events_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'whatsapp_consent_events is append-only';
END
$$;

REVOKE ALL ON FUNCTION public.whatsapp_consent_events_append_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS whatsapp_consent_events_no_change ON public.whatsapp_consent_events;
CREATE TRIGGER whatsapp_consent_events_no_change
  BEFORE UPDATE OR DELETE ON public.whatsapp_consent_events
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_consent_events_append_only();

-- ── Messages / delivery tracking ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id           UUID NOT NULL REFERENCES public.whatsapp_connections(shop_id),
  resource_type     TEXT NOT NULL CHECK (resource_type IN ('estimate', 'invoice', 'job')),
  resource_id       TEXT NOT NULL,
  resource_shop_id  UUID NOT NULL,
  customer_id       TEXT,
  to_phone_digits   TEXT NOT NULL CHECK (to_phone_digits ~ '^[1-9][0-9]{7,14}$'),
  template_name     TEXT NOT NULL,
  template_language TEXT NOT NULL,
  trigger           TEXT NOT NULL CHECK (trigger IN ('manual', 'automated')),
  mode              TEXT NOT NULL CHECK (mode IN ('sandbox', 'live')),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  wamid             TEXT UNIQUE,
  client_request_id UUID,
  dedupe_key        TEXT NOT NULL CHECK (dedupe_key ~ '^[0-9a-f]{64}$'),
  error_code        TEXT,
  error_title       TEXT,
  sent_by           UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at           TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  read_at           TIMESTAMPTZ,
  failed_at         TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_client_request_key
  ON public.whatsapp_messages (shop_id, client_request_id) WHERE client_request_id IS NOT NULL;

-- At most one non-failed message per dedupe key. A failed send frees the key
-- so it can be retried; a deliberate resend uses a new key (see
-- lib/whatsapp/dedupe.ts).
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_dedupe_key
  ON public.whatsapp_messages (shop_id, dedupe_key) WHERE status <> 'failed';

CREATE INDEX IF NOT EXISTS whatsapp_messages_resource_idx
  ON public.whatsapp_messages (shop_id, resource_type, resource_id, created_at DESC);

-- ── Lock down ──────────────────────────────────────────────────────────────
ALTER TABLE public.whatsapp_connections        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_connection_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_consents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_consent_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages           ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.whatsapp_connections        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.whatsapp_connection_secrets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.whatsapp_templates          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.whatsapp_consents           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.whatsapp_consent_events     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.whatsapp_messages           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.whatsapp_consent_events_id_seq FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_connections        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_connection_secrets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates          TO service_role;
GRANT SELECT, INSERT, UPDATE         ON public.whatsapp_consents           TO service_role;
GRANT SELECT, INSERT                 ON public.whatsapp_consent_events     TO service_role;
GRANT SELECT, INSERT, UPDATE         ON public.whatsapp_messages           TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.whatsapp_consent_events FROM service_role;
REVOKE DELETE, TRUNCATE ON public.whatsapp_consents FROM service_role;
REVOKE DELETE, TRUNCATE ON public.whatsapp_messages FROM service_role;
GRANT USAGE ON SEQUENCE public.whatsapp_consent_events_id_seq TO service_role;

-- ── Feature flag: merged D1 Imports shop only, disabled ────────────────────
DO $flag$
BEGIN
  IF to_regclass('public.feature_flags') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.shops WHERE id = '90b72748-bf01-4456-999f-f4ba48091606') THEN
    INSERT INTO public.feature_flags (flag_key, enabled, description, scope, shop_id)
    VALUES ('whatsapp_business', false,
            'WhatsApp Business (Meta Cloud API, coexistence) — Settings → Integrations and Send WhatsApp. Pilot: D1 Imports only.',
            'shop', '90b72748-bf01-4456-999f-f4ba48091606')
    ON CONFLICT DO NOTHING;
  END IF;
END
$flag$;

COMMIT;
