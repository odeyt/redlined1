-- Trial-tips emails — consent, suppression and a once-per-step send ledger.
--
-- Four short emails during a new shop's 7-day trial (First Job, Setup Help,
-- Status Board, Feedback), sent by the app through Resend and triggered by a
-- single scheduled job (.github/workflows/trial-tips.yml). This file holds
-- every rule that decides whether one of them may be sent.
--
-- ## Consent is explicit, verified and recorded
--
-- Nobody is enrolled from existing data. A row in trial_tip_subscriptions
-- exists only because a person ticked "Send me trial tips" at signup (recorded
-- once their email is verified) or switched it on in Settings. Each row
-- carries the consent-text version and the server time it was recorded; every
-- change is appended to trial_tip_consent_events.
--
-- ## Checked at the last moment
--
-- trial_tips_claim() re-evaluates eligibility inside the same statement that
-- reserves the send: consent still on, email verified, trial still running,
-- not converted to a paid plan, not suppressed, and this step not already
-- sent or in flight. It is the only way to reserve a send, so no caller can
-- skip a check.
--
-- ## Once per person per step
--
-- trial_tip_sends has one row per (user, step). Claiming is a single
-- INSERT … ON CONFLICT … DO UPDATE … WHERE, so two overlapping runs cannot
-- both win: the loser waits on the row lock, re-reads the winner's claim and
-- gets nothing back. Just before contacting Resend the job checks once more
-- (trial_tips_confirm) and withdraws the send if the person has since
-- unsubscribed, converted or been suppressed.
--
-- Retries (up to 3 attempts, while the step is still due) reuse the same
-- Resend idempotency key. Resend keeps keys for 24 hours, so an outcome that
-- is UNKNOWN — a network error, a 5xx, a crash between sending and recording —
-- is only retried within 23 hours of the key's first use; after that it is
-- never resent automatically and appears in trial_tips_needs_review() for a
-- person to check. A definite rejection (4xx) was not sent and may be retried.
--
-- ## Suppression
--
-- A bounce, complaint or Resend-side suppression (via the signed webhook)
-- marks the person suppressed. Suppression is not undone by the Settings
-- switch: an address that bounced or complained stays off.
--
-- ## Access
--
-- RLS is on and there are NO policies: only the service role (server routes,
-- the scheduled job) reads or writes these tables, and only it may execute the
-- functions. Nothing here is reachable from the browser.
--
-- ## One transaction; re-running
--
-- Everything is created inside one BEGIN … COMMIT, so a failure leaves nothing
-- behind. Re-running this exact file is harmless; changing it later is not
-- supported — use a new migration (CREATE TABLE IF NOT EXISTS would skip new
-- columns, CREATE OR REPLACE would overwrite hotfixes). Checks after COMMIT
-- are read-only.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- Tables
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.trial_tip_subscriptions (
  user_id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status                TEXT NOT NULL,
  consent_text_version  TEXT NOT NULL,
  consent_source        TEXT NOT NULL,
  -- When the person asked (signup: the account's creation time).
  consent_requested_at  TIMESTAMPTZ,
  -- When the server recorded it, after the email address was verified.
  consented_at          TIMESTAMPTZ NOT NULL,
  unsubscribed_at       TIMESTAMPTZ,
  unsubscribe_source    TEXT,
  suppressed_at         TIMESTAMPTZ,
  suppressed_reason     TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT trial_tip_subscriptions_status_check
    CHECK (status IN ('subscribed', 'unsubscribed', 'suppressed')),
  CONSTRAINT trial_tip_subscriptions_source_check
    CHECK (consent_source IN ('signup', 'settings')),
  CONSTRAINT trial_tip_subscriptions_unsub_source_check
    CHECK (unsubscribe_source IS NULL OR unsubscribe_source IN ('link', 'one_click', 'settings', 'admin')),
  CONSTRAINT trial_tip_subscriptions_suppressed_reason_check
    CHECK (suppressed_reason IS NULL OR suppressed_reason IN ('bounce', 'complaint', 'provider_suppressed'))
);

CREATE INDEX IF NOT EXISTS trial_tip_subscriptions_status_idx
  ON public.trial_tip_subscriptions (status);

-- Append-only record of every consent change.
CREATE TABLE IF NOT EXISTS public.trial_tip_consent_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action                TEXT NOT NULL,
  source                TEXT NOT NULL,
  consent_text_version  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT trial_tip_consent_events_action_check
    CHECK (action IN ('subscribed', 'unsubscribed', 'suppressed'))
);

CREATE INDEX IF NOT EXISTS trial_tip_consent_events_user_idx
  ON public.trial_tip_consent_events (user_id, created_at);

-- One row per person per step: the send ledger.
-- status
--   claimed    reserved; the provider may or may not have been contacted yet
--   sent       Resend accepted it (final)
--   failed     Resend definitely rejected it (a 4xx): nothing was sent
--   uncertain  the outcome is unknown (network error, 5xx, request in flight):
--              it may have been sent
--   withdrawn  the final pre-send check found the person no longer eligible
--
-- Retrying anything that MIGHT have been sent is only safe while Resend still
-- deduplicates the idempotency key — 24 hours from its first use, per
-- Resend's documentation. `uncertain` records that an attempt may have gone
-- out; `first_attempted_at` is when the key was first used. Past 23 hours
-- such a row is never retried automatically; it is listed by
-- trial_tips_needs_review() for a person to check in Resend's logs.
CREATE TABLE IF NOT EXISTS public.trial_tip_sends (
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step                TEXT NOT NULL,
  status              TEXT NOT NULL,
  attempts            INTEGER NOT NULL DEFAULT 1,
  first_attempted_at  TIMESTAMPTZ NOT NULL,
  claimed_at          TIMESTAMPTZ NOT NULL,
  uncertain           BOOLEAN NOT NULL DEFAULT false,
  sent_at             TIMESTAMPTZ,
  resend_email_id     TEXT,
  last_error          TEXT,

  PRIMARY KEY (user_id, step),
  CONSTRAINT trial_tip_sends_step_check
    CHECK (step IN ('first_job', 'setup_help', 'status_board', 'feedback')),
  CONSTRAINT trial_tip_sends_status_check
    CHECK (status IN ('claimed', 'sent', 'failed', 'uncertain', 'withdrawn')),
  CONSTRAINT trial_tip_sends_error_length CHECK (last_error IS NULL OR char_length(last_error) <= 500)
);

-- Webhooks map a bounce or complaint back to the email that caused it.
CREATE INDEX IF NOT EXISTS trial_tip_sends_email_id_idx
  ON public.trial_tip_sends (resend_email_id) WHERE resend_email_id IS NOT NULL;

-- Each signed webhook delivery is processed once, whatever Resend retries.
CREATE TABLE IF NOT EXISTS public.resend_webhook_events (
  webhook_id   TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  email_id     TEXT,
  outcome      TEXT NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Eligibility — the one place the rules live
-- ═══════════════════════════════════════════════════════════════════════════
--
-- trial_tips_current_step: the step a person's trial puts them at right now,
-- if they may be emailed at all — before looking at what was already sent.
--
--   consent       subscription status is 'subscribed'
--   verified      auth.users.email_confirmed_at is set and there is an email
--   trial         profiles.trial_ends_at is in the future
--   not paid      profiles.plan is not a paid plan (paid first, as in
--                 lib/planGate.ts getPlanStatus)
--   step          by elapsed time since the trial started (trial_ends_at minus
--                 the 7-day trial). Each step has a window; a step whose
--                 window has passed is skipped, never sent late:
--                   first_job     0 – 2 days
--                   setup_help    2 – 4 days
--                   status_board  4 – 6 days
--                   feedback      6 days – trial end
--
-- The windows and the 7-day length are held equal to lib/trialTips/config.ts
-- by a Jest test.
CREATE OR REPLACE FUNCTION public.trial_tips_current_step(p_user UUID, p_now TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_ends     TIMESTAMPTZ;
  v_plan     TEXT;
  v_elapsed  INTERVAL;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.trial_tip_subscriptions s
                 WHERE s.user_id = p_user AND s.status = 'subscribed') THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u
                 WHERE u.id = p_user AND u.email_confirmed_at IS NOT NULL
                   AND u.email IS NOT NULL AND u.email <> '') THEN
    RETURN NULL;
  END IF;

  SELECT p.trial_ends_at, p.plan INTO v_ends, v_plan
  FROM public.profiles p WHERE p.id = p_user;

  IF v_plan IN ('solo', 'starter', 'professional', 'business', 'enterprise', 'pro') THEN
    RETURN NULL;   -- converted
  END IF;
  IF v_ends IS NULL OR v_ends <= p_now THEN
    RETURN NULL;   -- no trial, or it has ended
  END IF;

  v_elapsed := p_now - (v_ends - INTERVAL '7 days');
  RETURN CASE
    WHEN v_elapsed < INTERVAL '2 days' THEN 'first_job'
    WHEN v_elapsed < INTERVAL '4 days' THEN 'setup_help'
    WHEN v_elapsed < INTERVAL '6 days' THEN 'status_board'
    ELSE 'feedback'
  END;
END $fn$;

-- Whether an existing send row may be tried (again) now. The ONE retry rule,
-- used both to list who is due and to claim.
--
--   sent                          never again
--   3 attempts used               never again
--   claimed < 15 minutes ago      in flight: not yet
--   might have been sent, and     never automatically. Resend deduplicates
--   first used ≥ 23 hours ago     an idempotency key for 24 hours; after
--                                 that a retry could deliver a second copy.
--                                 Such rows go to trial_tips_needs_review().
--   otherwise                     yes (a definite rejection, a withdrawal, or
--                                 an uncertain outcome still inside the window,
--                                 retried with the same key)
--
-- "Might have been sent" = the uncertain flag, or a row still 'claimed' or
-- 'uncertain' (a claim whose outcome was never recorded).
CREATE OR REPLACE FUNCTION public.trial_tips_retry_allowed(
  p_status TEXT, p_attempts INTEGER, p_claimed_at TIMESTAMPTZ,
  p_first_attempted_at TIMESTAMPTZ, p_uncertain BOOLEAN, p_now TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
  SELECT p_status <> 'sent'
     AND p_attempts < 3
     AND NOT (p_status = 'claimed' AND p_claimed_at > p_now - INTERVAL '15 minutes')
     AND NOT ((p_uncertain OR p_status IN ('claimed', 'uncertain'))
              AND p_first_attempted_at <= p_now - INTERVAL '23 hours');
$fn$;

-- The step a person is due for right now, or NULL: current step, and that
-- step's send row (if any) allows a (re)try.
CREATE OR REPLACE FUNCTION public.trial_tips_eligible_step(p_user UUID, p_now TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_step  TEXT := public.trial_tips_current_step(p_user, p_now);
  v_send  RECORD;
BEGIN
  IF v_step IS NULL THEN RETURN NULL; END IF;

  SELECT t.status, t.attempts, t.claimed_at, t.first_attempted_at, t.uncertain INTO v_send
  FROM public.trial_tip_sends t WHERE t.user_id = p_user AND t.step = v_step;

  IF FOUND AND NOT public.trial_tips_retry_allowed(
       v_send.status, v_send.attempts, v_send.claimed_at, v_send.first_attempted_at, v_send.uncertain, p_now) THEN
    RETURN NULL;
  END IF;
  RETURN v_step;
END $fn$;

-- Everyone due right now, with what the email needs. The address and shop
-- name are read here rather than passed around, so the job never holds a
-- stale copy.
CREATE OR REPLACE FUNCTION public.trial_tips_due(p_now TIMESTAMPTZ)
RETURNS TABLE (user_id UUID, step TEXT, email TEXT, shop_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT d.user_id, d.step, u.email::text,
         (SELECT sh.name FROM public.shop_users su
            JOIN public.shops sh ON sh.id = su.shop_id
          WHERE su.user_id = d.user_id AND su.role = 'owner'
          ORDER BY sh.name LIMIT 1)
  FROM (
    SELECT s.user_id, public.trial_tips_eligible_step(s.user_id, p_now) AS step
    FROM public.trial_tip_subscriptions s
    WHERE s.status = 'subscribed'
  ) d
  JOIN auth.users u ON u.id = d.user_id
  WHERE d.step IS NOT NULL
  ORDER BY d.user_id;
$fn$;

-- Reserve one send. TRUE only for the one caller that wins, and only if the
-- person is still eligible for exactly this step at this moment. Reclaiming a
-- row that might already have been sent marks it uncertain, so the 23-hour
-- limit applies to it from then on.
CREATE OR REPLACE FUNCTION public.trial_tips_claim(p_user UUID, p_step TEXT, p_now TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_won BOOLEAN;
BEGIN
  IF public.trial_tips_eligible_step(p_user, p_now) IS DISTINCT FROM p_step THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.trial_tip_sends AS t
    (user_id, step, status, attempts, first_attempted_at, claimed_at)
  VALUES (p_user, p_step, 'claimed', 1, p_now, p_now)
  ON CONFLICT (user_id, step) DO UPDATE
    SET status = 'claimed',
        attempts = t.attempts + 1,
        claimed_at = p_now,
        uncertain = t.uncertain OR t.status IN ('claimed', 'uncertain'),
        last_error = NULL
    WHERE public.trial_tips_retry_allowed(t.status, t.attempts, t.claimed_at, t.first_attempted_at, t.uncertain, p_now)
  RETURNING TRUE INTO v_won;

  RETURN COALESCE(v_won, FALSE);
END $fn$;

-- The last check, immediately before the request to Resend: the person is
-- still eligible for this step and we still hold its claim. Closes the gap
-- between claiming and sending (rendering, retries, a slow previous send).
CREATE OR REPLACE FUNCTION public.trial_tips_confirm(p_user UUID, p_step TEXT, p_now TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT public.trial_tips_current_step(p_user, p_now) IS NOT DISTINCT FROM p_step
     AND EXISTS (SELECT 1 FROM public.trial_tip_sends t
                 WHERE t.user_id = p_user AND t.step = p_step AND t.status = 'claimed');
$fn$;

CREATE OR REPLACE FUNCTION public.trial_tips_mark_sent(p_user UUID, p_step TEXT, p_email_id TEXT, p_now TIMESTAMPTZ)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  UPDATE public.trial_tip_sends
     SET status = 'sent', sent_at = p_now, resend_email_id = p_email_id, last_error = NULL
   WHERE user_id = p_user AND step = p_step AND status = 'claimed';
$fn$;

-- Resend definitely rejected it (4xx): nothing was sent.
CREATE OR REPLACE FUNCTION public.trial_tips_mark_failed(p_user UUID, p_step TEXT, p_error TEXT)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  UPDATE public.trial_tip_sends
     SET status = 'failed', last_error = left(coalesce(p_error, 'unknown error'), 500)
   WHERE user_id = p_user AND step = p_step AND status = 'claimed';
$fn$;

-- The outcome is unknown: it may have been sent.
CREATE OR REPLACE FUNCTION public.trial_tips_mark_uncertain(p_user UUID, p_step TEXT, p_error TEXT)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  UPDATE public.trial_tip_sends
     SET status = 'uncertain', uncertain = true, last_error = left(coalesce(p_error, 'unknown outcome'), 500)
   WHERE user_id = p_user AND step = p_step AND status = 'claimed';
$fn$;

-- The final check said no: nothing was sent.
CREATE OR REPLACE FUNCTION public.trial_tips_withdraw(p_user UUID, p_step TEXT)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  UPDATE public.trial_tip_sends
     SET status = 'withdrawn', last_error = 'no longer eligible at the final check'
   WHERE user_id = p_user AND step = p_step AND status = 'claimed';
$fn$;

-- Sends that might have gone out and can no longer be retried safely. A
-- person checks each in Resend's logs (tag step, recipient) and either marks
-- it sent or leaves it. Never retried automatically.
CREATE OR REPLACE FUNCTION public.trial_tips_needs_review(p_now TIMESTAMPTZ)
RETURNS TABLE (user_id UUID, step TEXT, status TEXT, attempts INTEGER, first_attempted_at TIMESTAMPTZ, last_error TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT t.user_id, t.step, t.status, t.attempts, t.first_attempted_at, t.last_error
  FROM public.trial_tip_sends t
  WHERE t.status <> 'sent'
    AND (t.uncertain OR t.status IN ('claimed', 'uncertain'))
    AND t.first_attempted_at <= p_now - INTERVAL '23 hours'
  ORDER BY t.first_attempted_at;
$fn$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Consent changes
-- ═══════════════════════════════════════════════════════════════════════════

-- Record consent. Refused for an unverified address.
--   signup    first time only — a later sign-in can never re-subscribe
--             someone who has since unsubscribed.
--   settings  subscribes, or re-subscribes after an unsubscribe; never
--             undoes a suppression.
-- Returns 'recorded' | 'already' | 'unverified' | 'suppressed'.
CREATE OR REPLACE FUNCTION public.trial_tips_record_consent(
  p_user UUID, p_version TEXT, p_source TEXT, p_requested_at TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_status TEXT;
BEGIN
  IF p_version IS NULL OR p_version = '' OR p_source NOT IN ('signup', 'settings') THEN
    RAISE EXCEPTION 'TRIAL_TIPS_BAD_CONSENT' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u
                 WHERE u.id = p_user AND u.email_confirmed_at IS NOT NULL) THEN
    RETURN 'unverified';
  END IF;

  SELECT s.status INTO v_status FROM public.trial_tip_subscriptions s
  WHERE s.user_id = p_user FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.trial_tip_subscriptions
      (user_id, status, consent_text_version, consent_source, consent_requested_at, consented_at)
    VALUES (p_user, 'subscribed', p_version, p_source, p_requested_at, now());
    INSERT INTO public.trial_tip_consent_events (user_id, action, source, consent_text_version)
    VALUES (p_user, 'subscribed', p_source, p_version);
    RETURN 'recorded';
  END IF;

  IF v_status = 'suppressed' THEN RETURN 'suppressed'; END IF;
  IF v_status = 'subscribed' OR p_source = 'signup' THEN RETURN 'already'; END IF;

  UPDATE public.trial_tip_subscriptions
     SET status = 'subscribed', consent_text_version = p_version, consent_source = p_source,
         consent_requested_at = p_requested_at, consented_at = now(),
         unsubscribed_at = NULL, unsubscribe_source = NULL, updated_at = now()
   WHERE user_id = p_user;
  INSERT INTO public.trial_tip_consent_events (user_id, action, source, consent_text_version)
  VALUES (p_user, 'subscribed', p_source, p_version);
  RETURN 'recorded';
END $fn$;

-- Stop. Idempotent: records an event only when something changed.
-- Returns 'unsubscribed' | 'already' | 'not_subscribed'.
CREATE OR REPLACE FUNCTION public.trial_tips_unsubscribe(p_user UUID, p_source TEXT)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF p_source NOT IN ('link', 'one_click', 'settings', 'admin') THEN
    RAISE EXCEPTION 'TRIAL_TIPS_BAD_SOURCE' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.trial_tip_subscriptions
     SET status = 'unsubscribed', unsubscribed_at = now(), unsubscribe_source = p_source, updated_at = now()
   WHERE user_id = p_user AND status = 'subscribed';
  IF FOUND THEN
    INSERT INTO public.trial_tip_consent_events (user_id, action, source)
    VALUES (p_user, 'unsubscribed', p_source);
    RETURN 'unsubscribed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.trial_tip_subscriptions WHERE user_id = p_user) THEN
    RETURN 'already';
  END IF;
  RETURN 'not_subscribed';
END $fn$;

-- Suppress after a bounce, complaint or provider suppression. Finds the
-- person by the email that bounced, falling back to the recipient address.
-- Returns the number of people suppressed (0 or 1).
CREATE OR REPLACE FUNCTION public.trial_tips_suppress(p_email_id TEXT, p_recipient TEXT, p_reason TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_user UUID;
BEGIN
  IF p_reason NOT IN ('bounce', 'complaint', 'provider_suppressed') THEN
    RAISE EXCEPTION 'TRIAL_TIPS_BAD_REASON' USING ERRCODE = 'P0001';
  END IF;

  SELECT t.user_id INTO v_user FROM public.trial_tip_sends t
  WHERE p_email_id IS NOT NULL AND t.resend_email_id = p_email_id LIMIT 1;

  IF v_user IS NULL AND p_recipient IS NOT NULL THEN
    SELECT u.id INTO v_user FROM auth.users u
    WHERE lower(u.email) = lower(p_recipient) LIMIT 1;
  END IF;

  IF v_user IS NULL THEN RETURN 0; END IF;

  UPDATE public.trial_tip_subscriptions
     SET status = 'suppressed', suppressed_at = now(), suppressed_reason = p_reason, updated_at = now()
   WHERE user_id = v_user AND status <> 'suppressed';
  IF NOT FOUND THEN RETURN 0; END IF;

  INSERT INTO public.trial_tip_consent_events (user_id, action, source)
  VALUES (v_user, 'suppressed', p_reason);
  RETURN 1;
END $fn$;

-- For an operator honouring a "please stop" reply to admin@redlined1.com,
-- without signing in as the customer. Run as the service role (for example
-- in the Supabase SQL editor):   SELECT public.trial_tips_unsubscribe_email('person@example.com');
-- Recorded as source 'admin' in the consent history.
-- Returns 'unsubscribed' | 'already' | 'not_subscribed' | 'no_account'.
CREATE OR REPLACE FUNCTION public.trial_tips_unsubscribe_email(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_user UUID;
BEGIN
  SELECT u.id INTO v_user FROM auth.users u
  WHERE lower(u.email) = lower(trim(p_email)) LIMIT 1;
  IF v_user IS NULL THEN RETURN 'no_account'; END IF;
  RETURN public.trial_tips_unsubscribe(v_user, 'admin');
END $fn$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Webhook deliveries: each processed once
-- ═══════════════════════════════════════════════════════════════════════════
--
-- TRUE for the first delivery of an id, and for a retry of one whose earlier
-- attempt died mid-processing (still 'processing' after 5 minutes). FALSE for
-- a delivery already handled.
CREATE OR REPLACE FUNCTION public.resend_webhook_claim(p_webhook_id TEXT, p_event_type TEXT, p_email_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_won BOOLEAN;
BEGIN
  INSERT INTO public.resend_webhook_events AS w (webhook_id, event_type, email_id, outcome, received_at)
  VALUES (p_webhook_id, p_event_type, p_email_id, 'processing', now())
  ON CONFLICT (webhook_id) DO UPDATE SET received_at = now()
    WHERE w.outcome = 'processing' AND w.received_at <= now() - INTERVAL '5 minutes'
  RETURNING TRUE INTO v_won;
  RETURN COALESCE(v_won, FALSE);
END $fn$;

CREATE OR REPLACE FUNCTION public.resend_webhook_finish(p_webhook_id TEXT, p_outcome TEXT)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  UPDATE public.resend_webhook_events SET outcome = p_outcome WHERE webhook_id = p_webhook_id;
$fn$;

-- Undo a claim whose processing failed, so the provider's retry is handled.
CREATE OR REPLACE FUNCTION public.resend_webhook_release(p_webhook_id TEXT)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  DELETE FROM public.resend_webhook_events WHERE webhook_id = p_webhook_id AND outcome = 'processing';
$fn$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Access: service role only
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.trial_tip_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_tip_consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_tip_sends          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resend_webhook_events    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.trial_tip_subscriptions  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.trial_tip_consent_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.trial_tip_sends          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.resend_webhook_events    FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.trial_tip_subscriptions  TO service_role;
GRANT ALL ON public.trial_tip_consent_events TO service_role;
GRANT ALL ON public.trial_tip_sends          TO service_role;
GRANT ALL ON public.resend_webhook_events    TO service_role;

REVOKE ALL ON FUNCTION public.trial_tips_eligible_step(UUID, TIMESTAMPTZ)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trial_tips_due(TIMESTAMPTZ)                            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trial_tips_claim(UUID, TEXT, TIMESTAMPTZ)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trial_tips_mark_sent(UUID, TEXT, TEXT, TIMESTAMPTZ)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trial_tips_mark_failed(UUID, TEXT, TEXT)               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trial_tips_record_consent(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trial_tips_unsubscribe(UUID, TEXT)                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trial_tips_suppress(TEXT, TEXT, TEXT)                  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trial_tips_eligible_step(UUID, TIMESTAMPTZ)            TO service_role;
GRANT EXECUTE ON FUNCTION public.trial_tips_due(TIMESTAMPTZ)                            TO service_role;
GRANT EXECUTE ON FUNCTION public.trial_tips_claim(UUID, TEXT, TIMESTAMPTZ)              TO service_role;
GRANT EXECUTE ON FUNCTION public.trial_tips_mark_sent(UUID, TEXT, TEXT, TIMESTAMPTZ)    TO service_role;
GRANT EXECUTE ON FUNCTION public.trial_tips_mark_failed(UUID, TEXT, TEXT)               TO service_role;
GRANT EXECUTE ON FUNCTION public.trial_tips_record_consent(UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.trial_tips_unsubscribe(UUID, TEXT)                     TO service_role;
GRANT EXECUTE ON FUNCTION public.trial_tips_suppress(TEXT, TEXT, TEXT)                  TO service_role;
REVOKE ALL ON FUNCTION public.trial_tips_current_step(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trial_tips_retry_allowed(TEXT, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trial_tips_confirm(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trial_tips_mark_uncertain(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trial_tips_withdraw(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trial_tips_needs_review(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trial_tips_unsubscribe_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trial_tips_current_step(UUID, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.trial_tips_retry_allowed(TEXT, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.trial_tips_confirm(UUID, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.trial_tips_mark_uncertain(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.trial_tips_withdraw(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.trial_tips_needs_review(TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.trial_tips_unsubscribe_email(TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.resend_webhook_claim(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resend_webhook_finish(TEXT, TEXT)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resend_webhook_release(TEXT)           FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resend_webhook_claim(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.resend_webhook_finish(TEXT, TEXT)      TO service_role;
GRANT EXECUTE ON FUNCTION public.resend_webhook_release(TEXT)           TO service_role;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Checks — read-only, run after COMMIT
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'tables (expect 4)' AS check_name, count(*)::text AS result
  FROM pg_tables WHERE schemaname = 'public'
   AND tablename IN ('trial_tip_subscriptions', 'trial_tip_consent_events', 'trial_tip_sends', 'resend_webhook_events')
UNION ALL
SELECT 'rls on for all four (expect 4)', count(*)::text
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relrowsecurity
   AND c.relname IN ('trial_tip_subscriptions', 'trial_tip_consent_events', 'trial_tip_sends', 'resend_webhook_events')
UNION ALL
SELECT 'browser roles can read consent (expect false)',
       (has_table_privilege('authenticated', 'public.trial_tip_subscriptions', 'SELECT')
     OR has_table_privilege('anon', 'public.trial_tip_subscriptions', 'SELECT'))::text
UNION ALL
SELECT 'browser roles can claim a send (expect false)',
       (has_function_privilege('authenticated', 'public.trial_tips_claim(uuid, text, timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.trial_tips_claim(uuid, text, timestamptz)', 'EXECUTE'))::text
UNION ALL
SELECT 'subscribed today (expect 0 right after applying)', count(*)::text
  FROM public.trial_tip_subscriptions;
