-- ============================================================================
-- Redlined1 — MESSAGING PROVIDER CREDENTIALS: server-only storage table
-- Run in: Supabase Dashboard → SQL Editor (against the redlined1-prod project)
-- Author: drafted by Claude Code, not yet executed against production.
--
-- CORRECTED FINDING (production schema inspection): an earlier draft of
-- this migration assumed shop_settings had a messaging_settings jsonb
-- column holding live Twilio/LINE/Telegram credentials, and included a
-- two-phase backfill-then-scrub design to relocate that data. Direct
-- inspection of the production schema disproved that assumption:
--   - public.shop_settings has NO messaging_settings column.
--   - No Twilio/LINE/Telegram/WhatsApp or other messaging-provider
--     credential column exists anywhere in the production database.
--   - A database-wide search for messaging-related column names found only
--     ordinary message/log columns (e.g. audit/notification text fields),
--     no provider credentials.
--   - The earlier Phase A backfill transaction was attempted, failed on
--     the nonexistent column, and rolled back cleanly (no partial writes).
-- In short: the application code (services/shopSettingsService.ts,
-- app/api/send-message) referenced a column that does not exist in
-- production. Messaging configuration was therefore nonfunctional or had
-- schema-drifted from whatever it was originally built against — this is
-- a "broken feature" finding, not a "credential exposure" finding. No
-- database-stored provider token was found anywhere. There is nothing to
-- migrate, back up, or scrub, and no rotation is required on this basis.
--
-- What this migration actually does: creates shop_messaging_secrets as a
-- new, empty, server-only table — the single, going-forward home for these
-- credentials once a shop owner configures them through the new owner-only
-- API (app/api/shop-messaging-secrets). Purely additive: does not read,
-- write, or reference shop_settings at all.
-- ============================================================================

BEGIN;

-- ── 1. Table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shop_messaging_secrets (
  shop_id             UUID PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
  twilio_sid          TEXT,
  twilio_token        TEXT,
  twilio_from         TEXT,
  sms_enabled         BOOLEAN NOT NULL DEFAULT false,
  whatsapp_enabled    BOOLEAN NOT NULL DEFAULT false,
  line_token          TEXT,
  line_enabled        BOOLEAN NOT NULL DEFAULT false,
  telegram_bot_token  TEXT,
  telegram_enabled    BOOLEAN NOT NULL DEFAULT false,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE public.shop_messaging_secrets IS
  'Server-only Twilio/LINE/Telegram credentials. No anon/authenticated grants — read/write exclusively through app/api/shop-messaging-secrets (service-role, owner-only) and app/api/messaging-channels-status (service-role, owner/manager/advisor, enabled-flags only). Never select this table from browser or mobile client code. Starts empty: there was no prior credential storage to migrate from — see the header note above.';

-- ── 2. RLS: enable + force, but add NO policies at all ────────────────────
-- No CREATE POLICY for anon or authenticated means default-deny for both —
-- the only way to reach this table's rows is the service-role key, which
-- bypasses RLS entirely (and is never present in any client bundle).
ALTER TABLE public.shop_messaging_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_messaging_secrets FORCE ROW LEVEL SECURITY;

-- ── 3. Grants: explicit revoke, service_role only ─────────────────────────
-- Defensive even though no GRANT was ever issued for this new table — makes
-- the "nobody but service_role" intent unambiguous rather than relying on
-- the absence of a grant statement.
REVOKE ALL ON public.shop_messaging_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.shop_messaging_secrets TO service_role;

-- No backfill / no INSERT of any kind: the table starts and stays empty
-- until a shop owner configures a channel through the new owner-only API.

COMMIT;

-- ============================================================================
-- Post-apply verification (read-only, safe to run immediately after commit).
-- ============================================================================

-- Expect rls_enabled = true, rls_forced = true.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'shop_messaging_secrets';

-- Expect ZERO rows — no policies at all means default-deny for every role
-- except service_role (which bypasses RLS and policies both).
SELECT policyname, roles, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'shop_messaging_secrets';

-- Expect ONLY service_role rows here — no anon, no authenticated, no PUBLIC.
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'shop_messaging_secrets'
ORDER BY grantee, privilege_type;

-- Catalog-level proof that anon/authenticated clients cannot read this
-- table. Uses has_table_privilege() rather than SET LOCAL ROLE + a live
-- SELECT — a role switch mid-session can behave inconsistently across
-- SQL-editor connection poolers, and deliberately triggering a
-- permission-denied error is a noisier signal than just reading the
-- catalog state that produces it. Every query below is a plain read with
-- no expected error.

-- Expect: false
SELECT has_table_privilege('anon', 'public.shop_messaging_secrets', 'SELECT') AS anon_can_select;

-- Expect: false
SELECT has_table_privilege('authenticated', 'public.shop_messaging_secrets', 'SELECT') AS authenticated_can_select;

-- Single pass/fail summary combining all checks above — expect TRUE.
SELECT
  NOT has_table_privilege('anon', 'public.shop_messaging_secrets', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.shop_messaging_secrets', 'SELECT')
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shop_messaging_secrets'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'shop_messaging_secrets'
      AND grantee <> 'service_role'
  ) AS fully_locked_down;

-- If fully_locked_down is not TRUE, STOP — do not consider this migration
-- complete, and re-run the grant statements in step 3 above.

-- Expect: 0 (table starts empty — no backfill was performed).
SELECT count(*) AS row_count FROM public.shop_messaging_secrets;

-- OPTIONAL — real end-to-end REST probe (separate from the catalog checks
-- above; use this for an actual over-the-wire confirmation, not as the
-- primary pass/fail signal):
--   GET {SUPABASE_URL}/rest/v1/shop_messaging_secrets?select=*
--   with the anon key, no session → expect 401/403, empty body.
--   GET {SUPABASE_URL}/rest/v1/shop_messaging_secrets?select=*
--   with any real authenticated user's access token → expect 401/403, empty body.

-- ============================================================================
-- Rollback (only if this migration itself breaks something unexpected).
-- ============================================================================
-- Safe to drop: this migration never reads or writes shop_settings or any
-- other existing table, so rolling it back loses nothing beyond whatever
-- test credentials may have been entered through the new API in the
-- meantime. The application's new code path would need its own revert too
-- (a normal git revert of the app deployment), independent of this SQL
-- rollback.
-- BEGIN;
-- DROP TABLE IF EXISTS public.shop_messaging_secrets;
-- COMMIT;
-- ============================================================================
