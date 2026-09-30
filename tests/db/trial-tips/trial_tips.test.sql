-- Behavioural tests for supabase/migrations/2026-09-30_trial_tips_email.sql.
-- Run ONLY inside the throwaway container of tests/db/run-trial-tips-db-tests.mjs.
-- Every assertion raises on failure (ON_ERROR_STOP).
--
-- "Now" is pinned so step windows are exact:  2026-10-10 12:00 UTC.

\set ON_ERROR_STOP on
\set QUIET on
SET client_min_messages = notice;

CREATE SCHEMA tests;
CREATE FUNCTION tests.ok(cond BOOLEAN, label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
END $$;
CREATE FUNCTION tests.throws(sql TEXT, pattern TEXT, label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_msg TEXT;
BEGIN
  BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM; END;
  IF v_msg IS NULL THEN RAISE EXCEPTION 'FAIL: % (no error raised)', label; END IF;
  IF v_msg !~ pattern THEN RAISE EXCEPTION 'FAIL: % (wrong error: %)', label, v_msg; END IF;
  RAISE NOTICE 'PASS: %', label;
END $$;
GRANT USAGE ON SCHEMA tests TO authenticated, anon, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO authenticated, anon, service_role;

CREATE FUNCTION tests.now() RETURNS TIMESTAMPTZ LANGUAGE sql IMMUTABLE AS $$ SELECT '2026-10-10 12:00:00+00'::timestamptz $$;
GRANT EXECUTE ON FUNCTION tests.now() TO service_role, authenticated, anon;

-- A person whose trial started `started` before tests.now().
CREATE FUNCTION tests.person(p_id UUID, p_email TEXT, p_verified BOOLEAN, p_plan TEXT, p_started INTERVAL, p_shop TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_shop UUID := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at, created_at)
  VALUES (p_id, p_email, CASE WHEN p_verified THEN tests.now() - p_started END, tests.now() - p_started);
  INSERT INTO public.profiles (id, plan, trial_ends_at)
  VALUES (p_id, p_plan, tests.now() - p_started + INTERVAL '7 days');
  INSERT INTO public.shops (id, name) VALUES (v_shop, p_shop);
  INSERT INTO public.shop_users (shop_id, user_id, role) VALUES (v_shop, p_id, 'owner');
END $$;

-- ── Fixtures ──────────────────────────────────────────────────────────────
SELECT tests.person('10000000-0000-4000-8000-000000000001', 'u1@test.local', true,  'trial',   '1 hour',              'Shop One');
SELECT tests.person('10000000-0000-4000-8000-000000000002', 'u2@test.local', false, 'trial',   '1 hour',              'Unverified');
SELECT tests.person('10000000-0000-4000-8000-000000000003', 'u3@test.local', true,  'trial',   '1 hour',              'No consent');
SELECT tests.person('10000000-0000-4000-8000-000000000004', 'u4@test.local', true,  'trial',   '1 hour',              'Unsubscribed');
SELECT tests.person('10000000-0000-4000-8000-000000000005', 'u5@test.local', true,  'starter', '1 day',               'Paid');
SELECT tests.person('10000000-0000-4000-8000-000000000006', 'u6@test.local', true,  'free',    '7 days 1 hour',       'Expired');
SELECT tests.person('10000000-0000-4000-8000-000000000007', 'u7@test.local', true,  'trial',   '2 days 12 hours',     'Day Two');
SELECT tests.person('10000000-0000-4000-8000-000000000008', 'u8@test.local', true,  'trial',   '4 days 12 hours',     'Day Four');
SELECT tests.person('10000000-0000-4000-8000-000000000009', 'u9@test.local', true,  'trial',   '6 days 12 hours',     'Day Six');
SELECT tests.person('10000000-0000-4000-8000-000000000010', 'u10@test.local', true, 'trial',   '1 hour',              'Suppressed');
SELECT tests.person('10000000-0000-4000-8000-000000000011', 'u11@test.local', true, 'trial',   '3 days',              'Already Sent');
SELECT tests.person('10000000-0000-4000-8000-000000000012', 'u12@test.local', true, 'trial',   '1 day 23 hours 59 minutes', 'Edge');
SELECT tests.person('10000000-0000-4000-8000-000000000013', 'u13@test.local', true, 'trial',   '1 hour',              'Crash');

-- ═══════════════════════════════════════════════════════════════════════════
-- Consent
-- ═══════════════════════════════════════════════════════════════════════════
SELECT tests.ok(public.trial_tips_record_consent('10000000-0000-4000-8000-000000000002', 'v1', 'signup', now()) = 'unverified',
                'an unverified address cannot be enrolled');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM public.trial_tip_subscriptions WHERE user_id = '10000000-0000-4000-8000-000000000002'),
                'nothing was recorded for the unverified address');

SELECT tests.ok(public.trial_tips_record_consent(u.id, 'v1', 'signup', u.created_at) = 'recorded', 'signup consent recorded: ' || u.email)
FROM auth.users u
WHERE u.id IN ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000005',
               '10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000008',
               '10000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000011',
               '10000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000013');

SELECT tests.ok((SELECT consented_at IS NOT NULL AND consent_text_version = 'v1' AND consent_source = 'signup'
                   AND consent_requested_at = (SELECT created_at FROM auth.users WHERE id = s.user_id)
                 FROM public.trial_tip_subscriptions s WHERE s.user_id = '10000000-0000-4000-8000-000000000001'),
                'consent carries its version, source, request time and server timestamp');
SELECT tests.ok(public.trial_tips_record_consent('10000000-0000-4000-8000-000000000001', 'v1', 'signup', now()) = 'already',
                'a verification retry (second callback) records nothing new');
SELECT tests.ok((SELECT count(*) FROM public.trial_tip_consent_events WHERE user_id = '10000000-0000-4000-8000-000000000001') = 1,
                'and appends no second consent event');

-- u4 unsubscribes; a later sign-in (signup source) must not re-enrol them.
SELECT tests.ok(public.trial_tips_unsubscribe('10000000-0000-4000-8000-000000000004', 'link') = 'unsubscribed', 'unsubscribe via link');
SELECT tests.ok(public.trial_tips_unsubscribe('10000000-0000-4000-8000-000000000004', 'one_click') = 'already', 'unsubscribing twice is a no-op');
SELECT tests.ok(public.trial_tips_record_consent('10000000-0000-4000-8000-000000000004', 'v1', 'signup', now()) = 'already',
                'a later callback cannot re-subscribe someone who unsubscribed');
SELECT tests.ok((SELECT status FROM public.trial_tip_subscriptions WHERE user_id = '10000000-0000-4000-8000-000000000004') = 'unsubscribed',
                'they stay unsubscribed');
SELECT tests.ok(public.trial_tips_unsubscribe('10000000-0000-4000-8000-000000000003', 'settings') = 'not_subscribed',
                'unsubscribing someone who never subscribed changes nothing');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM public.trial_tip_subscriptions WHERE user_id = '10000000-0000-4000-8000-000000000003'),
                'and creates no row for them');
SELECT tests.throws($$SELECT public.trial_tips_record_consent('10000000-0000-4000-8000-000000000003', '', 'signup', now())$$,
                    'TRIAL_TIPS_BAD_CONSENT', 'consent without a text version is refused');

-- u10 is suppressed by a bounce.
SELECT tests.ok(public.trial_tips_suppress(NULL, 'U10@TEST.LOCAL', 'bounce') = 1, 'a bounce suppresses by recipient, case-insensitively');
SELECT tests.ok(public.trial_tips_suppress(NULL, 'u10@test.local', 'complaint') = 0, 'suppressing again changes nothing');
SELECT tests.ok(public.trial_tips_record_consent('10000000-0000-4000-8000-000000000010', 'v1', 'settings', now()) = 'suppressed',
                'Settings cannot switch a suppressed address back on');
SELECT tests.ok(public.trial_tips_suppress('em_unknown', 'nobody@test.local', 'bounce') = 0, 'an unknown recipient suppresses no one');

-- ═══════════════════════════════════════════════════════════════════════════
-- Who is due, and for which step
-- ═══════════════════════════════════════════════════════════════════════════
-- u11 already received setup_help.
INSERT INTO public.trial_tip_sends (user_id, step, status, attempts, first_attempted_at, claimed_at, sent_at, resend_email_id)
VALUES ('10000000-0000-4000-8000-000000000011', 'setup_help', 'sent', 1, tests.now() - INTERVAL '1 day', tests.now() - INTERVAL '1 day', tests.now() - INTERVAL '1 day', 'em_u11');

CREATE TEMP TABLE due AS SELECT * FROM public.trial_tips_due(tests.now());

SELECT tests.ok((SELECT step FROM due WHERE user_id = '10000000-0000-4000-8000-000000000001') = 'first_job', 'just verified → First Job');
SELECT tests.ok((SELECT step FROM due WHERE user_id = '10000000-0000-4000-8000-000000000007') = 'setup_help', 'day 2.5 → Setup Help');
SELECT tests.ok((SELECT step FROM due WHERE user_id = '10000000-0000-4000-8000-000000000008') = 'status_board', 'day 4.5 → Status Board');
SELECT tests.ok((SELECT step FROM due WHERE user_id = '10000000-0000-4000-8000-000000000009') = 'feedback', 'day 6.5 → Feedback');
SELECT tests.ok((SELECT step FROM due WHERE user_id = '10000000-0000-4000-8000-000000000012') = 'first_job', 'one minute before day 2 is still First Job');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM due WHERE user_id = '10000000-0000-4000-8000-000000000002'), 'unverified: not due');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM due WHERE user_id = '10000000-0000-4000-8000-000000000003'), 'no consent: not due');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM due WHERE user_id = '10000000-0000-4000-8000-000000000004'), 'unsubscribed: not due');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM due WHERE user_id = '10000000-0000-4000-8000-000000000005'), 'converted to paid: not due');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM due WHERE user_id = '10000000-0000-4000-8000-000000000006'), 'trial expired: not due');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM due WHERE user_id = '10000000-0000-4000-8000-000000000010'), 'suppressed: not due');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM due WHERE user_id = '10000000-0000-4000-8000-000000000011'), 'step already sent: not sent again');
SELECT tests.ok((SELECT count(*) FROM due) = 6, 'exactly six people are due, one step each');
SELECT tests.ok((SELECT count(DISTINCT user_id) = count(*) FROM due), 'nobody is due more than one step at once');
SELECT tests.ok((SELECT email = 'u1@test.local' AND shop_name = 'Shop One' FROM due WHERE user_id = '10000000-0000-4000-8000-000000000001'),
                'the due row carries the current address and shop name');
-- A missed window is skipped, not sent late: u11 at day 3 already had
-- setup_help, and status_board is not open until day 4.
SELECT tests.ok(public.trial_tips_eligible_step('10000000-0000-4000-8000-000000000011', tests.now() + INTERVAL '1 day') = 'status_board',
                'the next step opens on schedule');
SELECT tests.ok(public.trial_tips_eligible_step('10000000-0000-4000-8000-000000000001', tests.now() + INTERVAL '3 days') = 'setup_help',
                'a First Job never sent is skipped once its window closes');

-- ═══════════════════════════════════════════════════════════════════════════
-- Claiming: once, at the last moment
-- ═══════════════════════════════════════════════════════════════════════════
SELECT tests.ok(public.trial_tips_claim('10000000-0000-4000-8000-000000000001', 'first_job', tests.now()), 'first claim wins');
SELECT tests.ok(NOT public.trial_tips_claim('10000000-0000-4000-8000-000000000001', 'first_job', tests.now()), 'a duplicate run cannot claim it again');
SELECT tests.ok(NOT public.trial_tips_claim('10000000-0000-4000-8000-000000000001', 'first_job', tests.now() + INTERVAL '10 minutes'),
                'nor while the claim is fresh');
SELECT tests.ok(NOT public.trial_tips_claim('10000000-0000-4000-8000-000000000001', 'setup_help', tests.now()),
                'a step the person is not due for cannot be claimed');

-- Failed send → retried, up to three attempts in all.
SELECT public.trial_tips_mark_failed('10000000-0000-4000-8000-000000000001', 'first_job', 'provider timeout');
SELECT tests.ok(public.trial_tips_claim('10000000-0000-4000-8000-000000000001', 'first_job', tests.now()), 'a failed send can be retried');
SELECT public.trial_tips_mark_failed('10000000-0000-4000-8000-000000000001', 'first_job', 'provider timeout');
SELECT tests.ok(public.trial_tips_claim('10000000-0000-4000-8000-000000000001', 'first_job', tests.now()), 'and retried again');
SELECT public.trial_tips_mark_failed('10000000-0000-4000-8000-000000000001', 'first_job', 'provider timeout');
SELECT tests.ok(NOT public.trial_tips_claim('10000000-0000-4000-8000-000000000001', 'first_job', tests.now()), 'but not after three attempts');
SELECT tests.ok(public.trial_tips_eligible_step('10000000-0000-4000-8000-000000000001', tests.now()) IS NULL,
                'and the person is no longer due for it');
SELECT tests.ok((SELECT attempts = 3 AND status = 'failed' AND last_error = 'provider timeout' FROM public.trial_tip_sends
                 WHERE user_id = '10000000-0000-4000-8000-000000000001' AND step = 'first_job'), 'attempts and the error are recorded');

-- A claim abandoned by a crash is retaken after 15 minutes (same idempotency key).
SELECT tests.ok(public.trial_tips_claim('10000000-0000-4000-8000-000000000013', 'first_job', tests.now()), 'claim, then the process dies');
SELECT tests.ok(NOT public.trial_tips_claim('10000000-0000-4000-8000-000000000013', 'first_job', tests.now() + INTERVAL '14 minutes'),
                'not retaken within 15 minutes');
SELECT tests.ok(public.trial_tips_claim('10000000-0000-4000-8000-000000000013', 'first_job', tests.now() + INTERVAL '15 minutes'),
                'retaken after 15 minutes');

-- Sent → never again.
SELECT tests.ok(public.trial_tips_claim('10000000-0000-4000-8000-000000000007', 'setup_help', tests.now()), 'claim setup_help');
SELECT public.trial_tips_mark_sent('10000000-0000-4000-8000-000000000007', 'setup_help', 'em_u7', tests.now());
SELECT tests.ok(NOT public.trial_tips_claim('10000000-0000-4000-8000-000000000007', 'setup_help', tests.now() + INTERVAL '1 hour'),
                'a sent step can never be claimed again');
SELECT tests.ok(public.trial_tips_eligible_step('10000000-0000-4000-8000-000000000007', tests.now() + INTERVAL '1 hour') IS NULL,
                'and is not due again');
SELECT public.trial_tips_mark_sent('10000000-0000-4000-8000-000000000007', 'setup_help', 'em_other', tests.now() + INTERVAL '2 hours');
SELECT tests.ok((SELECT resend_email_id FROM public.trial_tip_sends WHERE user_id = '10000000-0000-4000-8000-000000000007' AND step = 'setup_help') = 'em_u7',
                'marking sent twice does not overwrite the first record');

-- Last-moment checks: things that change between "due" and "claim".
UPDATE public.profiles SET plan = 'starter' WHERE id = '10000000-0000-4000-8000-000000000008';
SELECT tests.ok(NOT public.trial_tips_claim('10000000-0000-4000-8000-000000000008', 'status_board', tests.now()),
                'converting to paid after being listed stops the send');
SELECT public.trial_tips_unsubscribe('10000000-0000-4000-8000-000000000009', 'one_click');
SELECT tests.ok(NOT public.trial_tips_claim('10000000-0000-4000-8000-000000000009', 'feedback', tests.now()),
                'unsubscribing after being listed stops the send');
SELECT tests.ok(NOT public.trial_tips_claim('10000000-0000-4000-8000-000000000006', 'feedback', tests.now()),
                'an expired trial cannot be claimed');

-- A bounce on a sent email suppresses its person by email id.
SELECT tests.ok(public.trial_tips_suppress('em_u7', NULL, 'bounce') = 1, 'a bounce is matched to its person by email id');
SELECT tests.ok((SELECT status = 'suppressed' AND suppressed_reason = 'bounce' FROM public.trial_tip_subscriptions
                 WHERE user_id = '10000000-0000-4000-8000-000000000007'), 'that person is suppressed');
SELECT tests.ok(public.trial_tips_eligible_step('10000000-0000-4000-8000-000000000007', tests.now() + INTERVAL '2 days') IS NULL,
                'and gets no later step');
SELECT tests.ok(public.trial_tips_suppress('em_u11', NULL, 'complaint') = 1, 'a complaint suppresses too');

-- Settings: opt back in after an unsubscribe (fresh consent).
SELECT tests.ok(public.trial_tips_record_consent('10000000-0000-4000-8000-000000000004', 'v2', 'settings', now()) = 'recorded',
                'switching back on in Settings records fresh consent');
SELECT tests.ok((SELECT status = 'subscribed' AND consent_text_version = 'v2' AND consent_source = 'settings' AND unsubscribed_at IS NULL
                 FROM public.trial_tip_subscriptions WHERE user_id = '10000000-0000-4000-8000-000000000004'),
                'with the new wording version');
SELECT tests.ok((SELECT string_agg(action, ',' ORDER BY created_at, action) FROM public.trial_tip_consent_events
                 WHERE user_id = '10000000-0000-4000-8000-000000000004') = 'subscribed,unsubscribed,subscribed',
                'the full consent history is kept');

-- ═══════════════════════════════════════════════════════════════════════════
-- The final check, uncertain outcomes and Resend's 24-hour idempotency window
-- ═══════════════════════════════════════════════════════════════════════════
-- Fresh day-one subscribers, created here so the "who is due" counts above
-- are unaffected.
SELECT tests.person(('10000000-0000-4000-8000-0000000000' || n)::uuid, 'u' || n || '@test.local', true, 'trial', '1 hour', 'Shop ' || n)
FROM unnest(ARRAY['14','15','16','17','18','19']) n;
SELECT public.trial_tips_record_consent(('10000000-0000-4000-8000-0000000000' || n)::uuid, 'v1', 'signup', now())
FROM unnest(ARRAY['14','15','16','17','18','19']) n;

-- Final check: unsubscribe between the claim and the provider request.
SELECT tests.ok(public.trial_tips_claim('10000000-0000-4000-8000-000000000014', 'first_job', tests.now()), 'u14 claimed');
SELECT tests.ok(public.trial_tips_confirm('10000000-0000-4000-8000-000000000014', 'first_job', tests.now()), 'final check passes while nothing changed');
SELECT public.trial_tips_unsubscribe('10000000-0000-4000-8000-000000000014', 'one_click');
SELECT tests.ok(NOT public.trial_tips_confirm('10000000-0000-4000-8000-000000000014', 'first_job', tests.now()),
                'final check fails after an unsubscribe that landed after the claim');
SELECT public.trial_tips_withdraw('10000000-0000-4000-8000-000000000014', 'first_job');
SELECT tests.ok((SELECT status FROM public.trial_tip_sends WHERE user_id = '10000000-0000-4000-8000-000000000014') = 'withdrawn',
                'the send is withdrawn, not sent');
SELECT tests.ok(public.trial_tips_eligible_step('10000000-0000-4000-8000-000000000014', tests.now()) IS NULL, 'and they are not due');
SELECT public.trial_tips_record_consent('10000000-0000-4000-8000-000000000014', 'v1', 'settings', now());
SELECT tests.ok(public.trial_tips_claim('10000000-0000-4000-8000-000000000014', 'first_job', tests.now() + INTERVAL '1 minute'),
                'a withdrawn (never sent) step can be sent if they switch back on');

-- Final check: paid conversion between the claim and the provider request.
SELECT tests.ok(public.trial_tips_claim('10000000-0000-4000-8000-000000000015', 'first_job', tests.now()), 'u15 claimed');
UPDATE public.profiles SET plan = 'professional' WHERE id = '10000000-0000-4000-8000-000000000015';
SELECT tests.ok(NOT public.trial_tips_confirm('10000000-0000-4000-8000-000000000015', 'first_job', tests.now()),
                'final check fails after a paid conversion that landed after the claim');
SELECT tests.ok(NOT public.trial_tips_confirm('10000000-0000-4000-8000-000000000016', 'first_job', tests.now()),
                'final check fails when there is no claim to send under');

-- Uncertain outcome: retried with the same key inside 23 hours, never after.
SELECT tests.ok(public.trial_tips_claim('10000000-0000-4000-8000-000000000016', 'first_job', tests.now()), 'u16 first attempt');
SELECT public.trial_tips_mark_uncertain('10000000-0000-4000-8000-000000000016', 'first_job', 'application_error (no status)');
SELECT tests.ok(public.trial_tips_claim('10000000-0000-4000-8000-000000000016', 'first_job', tests.now() + INTERVAL '1 hour'),
                'an uncertain outcome is retried within the idempotency window');
SELECT public.trial_tips_mark_uncertain('10000000-0000-4000-8000-000000000016', 'first_job', 'application_error (503)');
SELECT tests.ok(public.trial_tips_eligible_step('10000000-0000-4000-8000-000000000016', tests.now() + INTERVAL '22 hours 59 minutes') = 'first_job',
                'still retryable at 22h59m');
SELECT tests.ok(NOT public.trial_tips_claim('10000000-0000-4000-8000-000000000016', 'first_job', tests.now() + INTERVAL '23 hours'),
                'NOT retried at 23 hours, before Resend forgets the key');
SELECT tests.ok(EXISTS (SELECT 1 FROM public.trial_tips_needs_review(tests.now() + INTERVAL '23 hours')
                        WHERE user_id = '10000000-0000-4000-8000-000000000016'), 'and it is listed for a person to review');

-- A crash (claim never resolved): reclaimable with the same key after 15
-- minutes, which marks it uncertain; never after 23 hours.
SELECT tests.ok(public.trial_tips_claim('10000000-0000-4000-8000-000000000017', 'first_job', tests.now()), 'u17 claimed, then the process dies');
SELECT tests.ok(NOT public.trial_tips_claim('10000000-0000-4000-8000-000000000017', 'first_job', tests.now() + INTERVAL '23 hours 30 minutes'),
                'a claim abandoned for 23 hours is never retried automatically');
SELECT tests.ok(EXISTS (SELECT 1 FROM public.trial_tips_needs_review(tests.now() + INTERVAL '23 hours 30 minutes')
                        WHERE user_id = '10000000-0000-4000-8000-000000000017' AND status = 'claimed'), 'it is listed for review');
SELECT tests.ok(public.trial_tips_claim('10000000-0000-4000-8000-000000000017', 'first_job', tests.now() + INTERVAL '16 minutes'),
                'but inside the window it is reclaimed');
SELECT tests.ok((SELECT uncertain FROM public.trial_tip_sends WHERE user_id = '10000000-0000-4000-8000-000000000017'),
                'and reclaiming it records that it may already have been sent');

-- A definite rejection sent nothing, so it stays retryable after 23 hours.
SELECT tests.ok(public.trial_tips_claim('10000000-0000-4000-8000-000000000018', 'first_job', tests.now()), 'u18 claimed');
SELECT public.trial_tips_mark_failed('10000000-0000-4000-8000-000000000018', 'first_job', 'validation_error (422)');
SELECT tests.ok(public.trial_tips_claim('10000000-0000-4000-8000-000000000018', 'first_job', tests.now() + INTERVAL '30 hours'),
                'a definite rejection can still be retried after 23 hours');
SELECT tests.ok(NOT EXISTS (SELECT 1 FROM public.trial_tips_needs_review(tests.now() + INTERVAL '30 hours')
                            WHERE user_id = '10000000-0000-4000-8000-000000000018' AND status <> 'claimed'),
                'and a definite rejection is not flagged for review');

-- Once any attempt was uncertain, a later rejection does not reopen the window.
SELECT tests.ok(public.trial_tips_claim('10000000-0000-4000-8000-000000000019', 'first_job', tests.now()), 'u19 claimed');
SELECT public.trial_tips_mark_uncertain('10000000-0000-4000-8000-000000000019', 'first_job', 'timeout');
SELECT tests.ok(public.trial_tips_claim('10000000-0000-4000-8000-000000000019', 'first_job', tests.now() + INTERVAL '1 hour'), 'u19 retried');
SELECT public.trial_tips_mark_failed('10000000-0000-4000-8000-000000000019', 'first_job', 'rate_limit_exceeded (429)');
SELECT tests.ok(NOT public.trial_tips_claim('10000000-0000-4000-8000-000000000019', 'first_job', tests.now() + INTERVAL '24 hours'),
                'a row that was ever uncertain is not retried past 23 hours, even after a later rejection');

-- ═══════════════════════════════════════════════════════════════════════════
-- Operator: "please stop" by reply, without signing in as the customer
-- ═══════════════════════════════════════════════════════════════════════════
SELECT tests.ok(public.trial_tips_unsubscribe_email('  U18@Test.Local ') = 'unsubscribed', 'an operator unsubscribes by address (trimmed, any case)');
SELECT tests.ok(public.trial_tips_unsubscribe_email('u18@test.local') = 'already', 'running it twice is a no-op');
SELECT tests.ok(public.trial_tips_unsubscribe_email('nobody@test.local') = 'no_account', 'an unknown address is reported, not guessed');
SELECT tests.ok(public.trial_tips_unsubscribe_email('u3@test.local') = 'not_subscribed', 'someone who never subscribed is reported as such');
SELECT tests.ok((SELECT source FROM public.trial_tip_consent_events
                 WHERE user_id = '10000000-0000-4000-8000-000000000018' AND action = 'unsubscribed') = 'admin',
                'the history records it as an operator action');

-- ═══════════════════════════════════════════════════════════════════════════
-- Webhook delivery dedupe
-- ═══════════════════════════════════════════════════════════════════════════
SELECT tests.ok(public.resend_webhook_claim('msg_1', 'email.bounced', 'em_x'), 'first delivery is processed');
SELECT tests.ok(NOT public.resend_webhook_claim('msg_1', 'email.bounced', 'em_x'), 'a retry of an in-flight delivery is not');
SELECT public.resend_webhook_finish('msg_1', 'suppressed');
SELECT tests.ok(NOT public.resend_webhook_claim('msg_1', 'email.bounced', 'em_x'), 'a finished delivery is never processed again');
SELECT tests.ok(public.resend_webhook_claim('msg_2', 'email.bounced', 'em_y'), 'claim msg_2');
SELECT public.resend_webhook_release('msg_2');
SELECT tests.ok(public.resend_webhook_claim('msg_2', 'email.bounced', 'em_y'), 'a released (failed) delivery is processed on retry');
UPDATE public.resend_webhook_events SET received_at = now() - INTERVAL '6 minutes' WHERE webhook_id = 'msg_2';
SELECT tests.ok(public.resend_webhook_claim('msg_2', 'email.bounced', 'em_y'), 'one stuck mid-processing is retaken after 5 minutes');

-- ═══════════════════════════════════════════════════════════════════════════
-- Nothing is reachable from the browser
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
SELECT tests.throws($$SELECT * FROM public.trial_tip_subscriptions$$, 'permission denied', 'a signed-in user cannot read consent records, even their own');
SELECT tests.throws($$SELECT public.trial_tips_claim('10000000-0000-4000-8000-000000000001', 'first_job', now())$$,
                    'permission denied', 'a signed-in user cannot claim a send');
SELECT tests.throws($$SELECT public.trial_tips_record_consent('10000000-0000-4000-8000-000000000003', 'v1', 'settings', now())$$,
                    'permission denied', 'a signed-in user cannot record consent directly');
SELECT tests.throws($$SELECT public.trial_tips_suppress(NULL, 'u1@test.local', 'bounce')$$,
                    'permission denied', 'a signed-in user cannot suppress anyone');
SELECT tests.throws($$SELECT public.trial_tips_unsubscribe_email('u3@test.local')$$,
                    'permission denied', 'a signed-in user cannot unsubscribe someone by address');
SELECT tests.throws($$SELECT public.trial_tips_confirm('10000000-0000-4000-8000-000000000001', 'first_job', now())$$,
                    'permission denied', 'a signed-in user cannot call the final check');
SELECT tests.throws($$SELECT * FROM public.trial_tips_needs_review(now())$$,
                    'permission denied', 'a signed-in user cannot list sends under review');
ROLLBACK;

BEGIN;
SET LOCAL ROLE anon;
SELECT tests.throws($$SELECT * FROM public.trial_tip_sends$$, 'permission denied', 'anonymous callers cannot read the send ledger');
SELECT tests.throws($$SELECT * FROM public.trial_tips_due(now())$$, 'permission denied', 'anonymous callers cannot list who is due');
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
SELECT tests.ok((SELECT count(*) FROM public.trial_tips_due(tests.now())) >= 0, 'the service role (server, scheduled job) can');
ROLLBACK;

SELECT tests.ok((SELECT bool_and(p.proconfig @> ARRAY['search_path=""']) FROM pg_proc p
                 WHERE p.proname LIKE 'trial_tips_%' OR p.proname LIKE 'resend_webhook_%'),
                'every function pins an empty search_path');

\echo ALL TRIAL TIPS DATABASE TESTS PASSED
