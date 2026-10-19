-- Rollback for 2026-10-19_whatsapp_business.sql.
--
-- FIRST, prefer the non-destructive off switches — they stop every send
-- immediately and keep consent and delivery history:
--   1. Settings → Integrations → WhatsApp Business → master switch OFF, or
--   2. UPDATE public.whatsapp_connections SET enabled = false;  or
--   3. Settings → Feature Flags → whatsapp_business OFF, or
--   4. unset WHATSAPP_LIVE_SENDING_ENABLED in Vercel (stops live sends).
--
-- This file DROPS the WhatsApp tables. That deletes consent records and the
-- delivery log. Export them first if any rows exist:
--   SELECT * FROM public.whatsapp_consent_events;
--   SELECT * FROM public.whatsapp_messages;
--
-- It does NOT touch Meta: the number stays on the WhatsApp Business App and
-- (if connected) on Cloud API. To end coexistence, the owner disconnects in
-- the app: Settings → Account → Business Platform → Disconnect Account.
--
-- Touches nothing outside these tables except the flag row it seeded.
--
-- Locked: uncomment the set_config line just after BEGIN to run it (it is
-- transaction-local, so it must stay inside the transaction).

BEGIN;

-- SELECT set_config('whatsapp.rollback', 'confirmed', true);

DO $lock$
BEGIN
  IF current_setting('whatsapp.rollback', true) IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION 'Rollback is locked. Read the header, export history, then uncomment the set_config line.';
  END IF;
END
$lock$;

DROP TABLE IF EXISTS public.whatsapp_messages;
DROP TABLE IF EXISTS public.whatsapp_consent_events;
DROP TABLE IF EXISTS public.whatsapp_consents;
DROP TABLE IF EXISTS public.whatsapp_templates;
DROP TABLE IF EXISTS public.whatsapp_connection_secrets;
DROP TABLE IF EXISTS public.whatsapp_connections;
DROP FUNCTION IF EXISTS public.whatsapp_consent_events_append_only();

DO $flag$
BEGIN
  IF to_regclass('public.feature_flags') IS NOT NULL THEN
    DELETE FROM public.feature_flags WHERE flag_key = 'whatsapp_business';
  END IF;
END
$flag$;

COMMIT;
