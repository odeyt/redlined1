-- Call the push sender whenever an alert is recorded.
--
-- RUN AGAINST redlined1. SUBSTITUTE THE SECRET FIRST — see below.
--
-- This is what the dashboard's "Database Webhooks" feature creates for you.
-- That page has moved out of the Database sidebar in recent Supabase versions,
-- and the underlying mechanism is just pg_net plus a trigger, so it is written
-- out here instead. Being in a migration is an improvement anyway: a webhook
-- configured by hand in a dashboard exists nowhere in the repository and is
-- invisible to whoever inherits this.
--
-- ── BEFORE RUNNING ──────────────────────────────────────────────────────────
-- Replace PASTE_SECRET_HERE below with the single line inside
-- %TEMP%\push-secret.txt on the machine that set this up. It must match the
-- PUSH_WEBHOOK_SECRET environment variable in Vercel exactly, or every push
-- is rejected with 401.
--
-- Do not commit the substituted version. This file keeps the placeholder.
--
-- ── Why the secret exists ───────────────────────────────────────────────────
-- Without it, /api/push/send would let anyone on the internet deliver a
-- notification to this shop's phones, carrying the shop's own icon. That is a
-- convincing phishing surface, not just a nuisance.

BEGIN;

-- pg_net makes the HTTP call. It is what Supabase's own webhook UI uses.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_push_on_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $fn$
BEGIN
  -- Fire and forget. net.http_post queues the request and returns immediately,
  -- so a slow or failing push endpoint can never delay — or roll back — the
  -- transaction that recorded the alert. The alert being written matters more
  -- than the notification being delivered.
  PERFORM net.http_post(
    url     := 'https://www.redlined1.com/api/push/send',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-push-secret',  'PASTE_SECRET_HERE'
    ),
    body    := jsonb_build_object('record', to_jsonb(NEW))
  );
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS alert_events_push ON public.alert_events;
CREATE TRIGGER alert_events_push
  AFTER INSERT ON public.alert_events
  FOR EACH ROW EXECUTE FUNCTION public.notify_push_on_alert();

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
--
-- Trigger attached:
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.alert_events'::regclass AND NOT tgisinternal;
--
-- After causing an alert (mark an invoice Paid), the call and its response:
--   SELECT id, status_code, content::text, created
--   FROM net._http_response ORDER BY created DESC LIMIT 5;
--
-- Expect 200 with {"ok":true,...}. A 401 means the secret here and the one in
-- Vercel disagree. A 503 means the VAPID keys are missing from the deployment.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   DROP TRIGGER IF EXISTS alert_events_push ON public.alert_events;
--   DROP FUNCTION IF EXISTS public.notify_push_on_alert();
-- Alerts keep recording and keep appearing as toasts; only push stops.
