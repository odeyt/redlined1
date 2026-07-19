-- ============================================================================
-- Redlined1 — MESSAGING PROVIDER CREDENTIALS: server-only storage migration
-- Run in: Supabase Dashboard → SQL Editor (against the redlined1-prod project)
-- Author: drafted by Claude Code, not yet executed against production.
--
-- This is a TWO-PHASE migration. Run PHASE A before deploying the app code
-- in branch feat/coordinated-messaging-security. Run PHASE B only after
-- that deployment has been verified working in production (see the
-- deployment sequence in this same docs/ directory:
-- MESSAGING_SECURITY_DEPLOYMENT_SEQUENCE.md). Do not run Phase B early —
-- it removes the old secret storage, and the new code path must be proven
-- working first.
--
-- What this fixes: shop_settings.messaging_settings (Twilio auth token,
-- LINE Notify token, Telegram bot token) was readable by the browser
-- anon-key client via a shared `select('*')` in multiple client screens,
-- with RLS on shop_settings having no role check. Application code already
-- stopped reading/writing that column (see services/shopSettingsService.ts,
-- services/messagingSecretsService.ts) — this migration relocates the data
-- itself and then, in Phase B, removes it from the exposed column.
-- ============================================================================


-- ============================================================================
-- PHASE A — run BEFORE deploying feat/coordinated-messaging-security.
-- Idempotent / safe to re-run any number of times. Never overwrites an
-- existing (possibly since-rotated or since-edited) destination value —
-- see the backfill block below for exactly how that's enforced. Does NOT
-- touch or remove shop_settings.messaging_settings in any way.
-- ============================================================================

BEGIN;

-- ── A1. Table ───────────────────────────────────────────────────────────
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
  'Server-only Twilio/LINE/Telegram credentials. No anon/authenticated grants — read/write exclusively through app/api/shop-messaging-secrets (service-role, owner-only) and app/api/messaging-channels-status (service-role, owner/manager/advisor, enabled-flags only). Never select this table from browser or mobile client code.';

-- ── A2. RLS: enable + force, but add NO policies at all ────────────────────
-- No CREATE POLICY for anon or authenticated means default-deny for both —
-- the only way to reach this table's rows is the service-role key, which
-- bypasses RLS entirely (and is never present in any client bundle).
ALTER TABLE public.shop_messaging_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_messaging_secrets FORCE ROW LEVEL SECURITY;

-- ── A3. Grants: explicit revoke, service_role only ─────────────────────────
-- Defensive even though no GRANT was ever issued for this new table — makes
-- the "nobody but service_role" intent unambiguous rather than relying on
-- the absence of a grant statement.
REVOKE ALL ON public.shop_messaging_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.shop_messaging_secrets TO service_role;

-- ── A4. Backfill — insert-if-absent, populate-only-null-fields on rerun ────
-- NOT an unconditional overwrite. Two cases:
--   (a) No row exists yet for this shop_id → INSERT the full row from the
--       source jsonb (this is the normal first-run path).
--   (b) A row already exists (a prior run of this migration, or — after
--       deployment — the owner has since used the new credential API to
--       set/rotate a value) → the ON CONFLICT branch below fires, and each
--       secret column is only ever set via COALESCE(existing, new): if the
--       destination already has a non-null value, it is kept exactly as-is
--       and the source value is discarded. A rerun can therefore never
--       clobber a value that's already live in the new table, rotated or
--       not. The four *_enabled boolean flags are deliberately OMITTED from
--       the UPDATE SET clause entirely — on a rerun they are left
--       completely untouched, never reset from the (possibly stale) source.
INSERT INTO public.shop_messaging_secrets (
  shop_id, twilio_sid, twilio_token, twilio_from,
  sms_enabled, whatsapp_enabled,
  line_token, line_enabled,
  telegram_bot_token, telegram_enabled,
  updated_at
)
SELECT
  s.shop_id,
  NULLIF(s.messaging_settings->>'twilioSid', ''),
  NULLIF(s.messaging_settings->>'twilioToken', ''),
  NULLIF(s.messaging_settings->>'twilioFrom', ''),
  COALESCE((s.messaging_settings->>'smsEnabled')::boolean, false),
  COALESCE((s.messaging_settings->>'whatsappEnabled')::boolean, false),
  NULLIF(s.messaging_settings->>'lineToken', ''),
  COALESCE((s.messaging_settings->>'lineEnabled')::boolean, false),
  NULLIF(s.messaging_settings->>'telegramBotToken', ''),
  COALESCE((s.messaging_settings->>'telegramEnabled')::boolean, false),
  now()
FROM public.shop_settings s
WHERE s.messaging_settings IS NOT NULL
  AND s.shop_id IS NOT NULL
ON CONFLICT (shop_id) DO UPDATE SET
  twilio_sid         = COALESCE(shop_messaging_secrets.twilio_sid, EXCLUDED.twilio_sid),
  twilio_token       = COALESCE(shop_messaging_secrets.twilio_token, EXCLUDED.twilio_token),
  twilio_from        = COALESCE(shop_messaging_secrets.twilio_from, EXCLUDED.twilio_from),
  line_token         = COALESCE(shop_messaging_secrets.line_token, EXCLUDED.line_token),
  telegram_bot_token = COALESCE(shop_messaging_secrets.telegram_bot_token, EXCLUDED.telegram_bot_token),
  updated_at         = now();
  -- sms_enabled / whatsapp_enabled / line_enabled / telegram_enabled:
  -- intentionally not listed here — see comment above.

COMMIT;

-- ── A5. Post-apply verification (read-only) ────────────────────────────────

-- Expect rls_enabled = true, rls_forced = true.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'shop_messaging_secrets';

-- Expect ZERO rows — no policies at all means default-deny for every role
-- except service_role (which bypasses RLS and policies both).
SELECT policyname, roles, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'shop_messaging_secrets';

-- Expect ONLY service_role rows here — no anon, no authenticated.
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'shop_messaging_secrets'
ORDER BY grantee, privilege_type;

-- COVERAGE CHECK — expect ZERO rows. Covers EVERY operational value the
-- backfill above is responsible for (all three secret strings, the
-- from-number, and all four enabled flags — not just the three token
-- columns), and proves the destination holds the value the source implies
-- it should, not merely that the destination is non-null. Boolean flags
-- are compared explicitly (IS DISTINCT FROM, NULL-safe) rather than
-- inferred from presence. NEVER selects an actual secret value — only
-- per-column boolean MISMATCH indicators plus shop_id, so this output is
-- safe to paste into a ticket or incident report without leaking anything.
--
-- Caveat: this check assumes source and destination should be byte-for-byte
-- identical, which is only guaranteed true immediately after a FRESH Phase
-- A run, before any deployment of the owner-gated credential API. If you
-- are re-running this coverage check much later — after the app has been
-- deployed and an owner has since rotated a credential via Settings — a
-- mismatch on a *_token/*_sid/*_from column is EXPECTED (the destination
-- correctly kept the newer, rotated value; the backfill's COALESCE
-- deliberately never overwrites it) and is not a bug. Treat this query as
-- authoritative only when run right after Phase A, before Phase B/step 3
-- of the deployment sequence.
WITH source AS (
  SELECT
    shop_id,
    NULLIF(messaging_settings->>'twilioSid', '')                        AS twilio_sid,
    NULLIF(messaging_settings->>'twilioToken', '')                      AS twilio_token,
    NULLIF(messaging_settings->>'twilioFrom', '')                       AS twilio_from,
    COALESCE((messaging_settings->>'smsEnabled')::boolean, false)       AS sms_enabled,
    COALESCE((messaging_settings->>'whatsappEnabled')::boolean, false)  AS whatsapp_enabled,
    NULLIF(messaging_settings->>'lineToken', '')                        AS line_token,
    COALESCE((messaging_settings->>'lineEnabled')::boolean, false)      AS line_enabled,
    NULLIF(messaging_settings->>'telegramBotToken', '')                 AS telegram_bot_token,
    COALESCE((messaging_settings->>'telegramEnabled')::boolean, false)  AS telegram_enabled
  FROM public.shop_settings
  WHERE messaging_settings IS NOT NULL
)
SELECT
  s.shop_id,
  (s.twilio_sid          IS DISTINCT FROM d.twilio_sid)          AS twilio_sid_mismatch,
  (s.twilio_token         IS DISTINCT FROM d.twilio_token)        AS twilio_token_mismatch,
  (s.twilio_from          IS DISTINCT FROM d.twilio_from)         AS twilio_from_mismatch,
  (s.sms_enabled          IS DISTINCT FROM d.sms_enabled)         AS sms_enabled_mismatch,
  (s.whatsapp_enabled     IS DISTINCT FROM d.whatsapp_enabled)    AS whatsapp_enabled_mismatch,
  (s.line_token           IS DISTINCT FROM d.line_token)          AS line_token_mismatch,
  (s.line_enabled         IS DISTINCT FROM d.line_enabled)        AS line_enabled_mismatch,
  (s.telegram_bot_token   IS DISTINCT FROM d.telegram_bot_token)  AS telegram_bot_token_mismatch,
  (s.telegram_enabled     IS DISTINCT FROM d.telegram_enabled)    AS telegram_enabled_mismatch
FROM source s
LEFT JOIN public.shop_messaging_secrets d ON d.shop_id = s.shop_id
WHERE
     (s.twilio_sid        IS DISTINCT FROM d.twilio_sid)
  OR (s.twilio_token       IS DISTINCT FROM d.twilio_token)
  OR (s.twilio_from        IS DISTINCT FROM d.twilio_from)
  OR (s.sms_enabled        IS DISTINCT FROM d.sms_enabled)
  OR (s.whatsapp_enabled   IS DISTINCT FROM d.whatsapp_enabled)
  OR (s.line_token         IS DISTINCT FROM d.line_token)
  OR (s.line_enabled       IS DISTINCT FROM d.line_enabled)
  OR (s.telegram_bot_token IS DISTINCT FROM d.telegram_bot_token)
  OR (s.telegram_enabled   IS DISTINCT FROM d.telegram_enabled);

-- Row-count sanity check: should roughly match the number of shops that had
-- a non-null messaging_settings before this ran.
SELECT count(*) AS migrated_rows FROM public.shop_messaging_secrets;

-- Live functional check (not just catalog state): as an authenticated
-- non-service-role session (i.e. via the app, logged in as any real staff
-- account), attempt to read shop_messaging_secrets directly — expect a
-- permission-denied error (no SELECT grant at all for `authenticated`),
-- never a row, never a token:
--   GET {SUPABASE_URL}/rest/v1/shop_messaging_secrets?select=*
--   with an authenticated user's access token → expect 401/403, empty body.
--   GET {SUPABASE_URL}/rest/v1/shop_messaging_secrets?select=*
--   with the anon key, no session → expect 401/403, empty body.
-- See "Phase B step 6" below for the SQL-level equivalent of this same check.

-- ── A6. Rollback (only if Phase A itself breaks something unexpected) ──────
-- Safe to drop: shop_settings.messaging_settings is completely untouched by
-- Phase A in either direction, so nothing is lost by rolling this back —
-- the application's new code path would need its own revert too (a normal
-- git revert of the app deployment), independent of this SQL rollback.
-- BEGIN;
-- DROP TABLE IF EXISTS public.shop_messaging_secrets;
-- COMMIT;


-- ============================================================================
-- PHASE B — run ONLY after feat/coordinated-messaging-security has been
-- deployed to production AND verified (settings save/load, SMS/WhatsApp
-- send, cross-shop denial, role denial — see the deployment sequence doc).
-- This phase REMOVES the secret keys from shop_settings.messaging_settings.
-- Do not skip or indefinitely postpone this phase — leaving both copies of
-- the credentials live defeats the purpose of this migration.
-- ============================================================================

-- ── B1. Pre-check (manual, not SQL) ─────────────────────────────────────
-- Before running the DELETE below, confirm from application observability
-- (deploy logs / APM / a code search of the deployed commit) that no
-- currently-running code path reads or writes shop_settings.messaging_settings.
-- As of this migration, the only two places that ever touched that column
-- were services/shopSettingsService.ts (now uses an explicit column
-- allowlist that excludes it) and app/api/send-message/route.ts (now reads
-- shop_messaging_secrets exclusively) — grep the deployed commit for
-- "messaging_settings" and confirm zero remaining references outside this
-- migration file and historical docs.

BEGIN;

-- ── B2. Strip secret keys from the jsonb column, scoped to shops that
--        already have a destination row (never strips a shop whose
--        credentials somehow never made it into shop_messaging_secrets —
--        that would be irreversible data loss; re-run Phase A's coverage
--        check first if this WHERE excludes any shop you expected covered).
UPDATE public.shop_settings s
SET messaging_settings = (
  COALESCE(s.messaging_settings, '{}'::jsonb)
    - 'twilioSid' - 'twilioToken' - 'twilioFrom'
    - 'smsEnabled' - 'whatsappEnabled'
    - 'lineToken' - 'lineEnabled'
    - 'telegramBotToken' - 'telegramEnabled'
)
WHERE s.messaging_settings IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.shop_messaging_secrets d WHERE d.shop_id = s.shop_id);

-- ── B3. Collapse an emptied object to NULL. If any OTHER, unrelated key
--        had ever been added to this jsonb blob it survives here (this
--        migration only ever removes the specific secret keys listed
--        above) — "preserve only explicitly approved non-secret settings,
--        if still required" per the remediation request. As of this
--        migration no such non-secret key is known to exist.
UPDATE public.shop_settings
SET messaging_settings = NULL
WHERE messaging_settings = '{}'::jsonb;

COMMIT;

-- ── B4. Verification — expect ZERO rows. Proves no shop_settings row still
--        carries any of the removed secret/config keys.
SELECT shop_id
FROM public.shop_settings
WHERE messaging_settings ?| array[
  'twilioSid', 'twilioToken', 'twilioFrom',
  'smsEnabled', 'whatsappEnabled',
  'lineToken', 'lineEnabled',
  'telegramBotToken', 'telegramEnabled'
];

-- ── B5. Verification — the live credentials still exist exactly once, in
--        the new table (sanity check that B2/B3 didn't touch the actual
--        secret storage, only the old duplicate).
SELECT count(*) AS rows_in_new_table FROM public.shop_messaging_secrets;

-- ── B6. Catalog-level proof that anon/authenticated clients cannot read
--        shop_messaging_secrets. Uses has_table_privilege() plus the
--        policy/grant catalogs directly rather than SET LOCAL ROLE + a live
--        SELECT — a role switch mid-session can behave inconsistently
--        across SQL-editor connection poolers, and deliberately triggering
--        a permission-denied error is a noisier signal than just reading
--        the catalog state that produces it. Every query below is a plain
--        read with no expected error; run each one and check the result
--        against the "Expect" comment.

-- Expect: false
SELECT has_table_privilege('anon', 'public.shop_messaging_secrets', 'SELECT') AS anon_can_select;

-- Expect: false
SELECT has_table_privilege('authenticated', 'public.shop_messaging_secrets', 'SELECT') AS authenticated_can_select;

-- Expect: zero rows — no RLS policy exists for any role.
SELECT policyname, roles, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'shop_messaging_secrets';

-- Expect: only service_role rows — no anon, no authenticated, no PUBLIC.
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'shop_messaging_secrets'
ORDER BY grantee, privilege_type;

-- Single pass/fail summary combining all four checks above — expect TRUE.
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
-- complete, and re-run the A3 grant statements.
--
-- OPTIONAL — real end-to-end REST probe (separate from the catalog checks
-- above; use this for an actual over-the-wire confirmation, not as the
-- primary pass/fail signal):
--   GET {SUPABASE_URL}/rest/v1/shop_messaging_secrets?select=*
--   with the anon key, no session → expect 401/403, empty body.
--   GET {SUPABASE_URL}/rest/v1/shop_messaging_secrets?select=*
--   with any real authenticated user's access token → expect 401/403, empty body.

-- ============================================================================
-- Rollback for Phase B — restores SERVICE FUNCTIONALITY without re-exposing
-- credentials. Do NOT restore secret values into shop_settings.messaging_settings
-- as a rollback step — that undoes the entire point of this migration and
-- re-creates the original exposure. shop_messaging_secrets is untouched by
-- Phase B (only the OLD duplicate column was stripped), so the application
-- continues to read live, correct credentials from there throughout —
-- there is nothing to "restore" on the data side. If a rollback is
-- genuinely needed:
--   1. Redeploy the previous application release (git revert of the app
--      deployment), NOT a data restore.
--   2. If that previous release's code path required
--      shop_settings.messaging_settings to be populated (i.e. you are
--      rolling back past the point where the app started reading
--      shop_messaging_secrets), re-derive ONLY the non-secret boolean
--      enabled flags from shop_messaging_secrets back into the jsonb
--      column — never the secret token/sid values — as a temporary,
--      degraded compatibility shim:
--        UPDATE public.shop_settings s
--        SET messaging_settings = COALESCE(s.messaging_settings, '{}'::jsonb)
--          || jsonb_build_object(
--               'smsEnabled', d.sms_enabled, 'whatsappEnabled', d.whatsapp_enabled,
--               'lineEnabled', d.line_enabled, 'telegramEnabled', d.telegram_enabled
--             )
--        FROM public.shop_messaging_secrets d
--        WHERE d.shop_id = s.shop_id;
--      This lets old UI show correct toggle states; actual sending would
--      still correctly fail closed (no credentials present) rather than
--      silently using a stale/wrong value.
-- ============================================================================
