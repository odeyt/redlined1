-- Behavioural tests for supabase/migrations/2026-09-29_internal_reminders.sql.
--
-- Run ONLY inside the throwaway container started by
-- tests/db/run-reminders-db-tests.mjs, after stub_schema.sql and the
-- migration. Every assertion raises on failure; psql runs with
-- ON_ERROR_STOP, so the first failure stops the run with a non-zero exit.
--
-- Calls are made as the `authenticated` role with request.jwt.claim.sub set,
-- which is exactly how PostgREST presents a signed-in user to Postgres, so
-- the RLS policies and auth.uid() behave as they do in production.

\set ON_ERROR_STOP on
\set QUIET on
SET client_min_messages = notice;

-- ── Helpers ────────────────────────────────────────────────────────────────
CREATE SCHEMA tests;
GRANT USAGE ON SCHEMA tests TO authenticated, anon;

CREATE FUNCTION tests.ok(cond BOOLEAN, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: %', label;
  END IF;
  RAISE NOTICE 'PASS: %', label;
END $$;

-- Runs `sql` and passes only if it raises an error matching `pattern`.
CREATE FUNCTION tests.throws(sql TEXT, pattern TEXT, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_msg TEXT;
BEGIN
  BEGIN
    EXECUTE sql;
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  IF v_msg IS NULL THEN
    RAISE EXCEPTION 'FAIL: % (no error raised)', label;
  END IF;
  IF v_msg !~ pattern THEN
    RAISE EXCEPTION 'FAIL: % (wrong error: %)', label, v_msg;
  END IF;
  RAISE NOTICE 'PASS: %', label;
END $$;

-- Number of rows an UPDATE touched, so "denied" is distinguishable from
-- "silently matched nothing" where that matters.
CREATE FUNCTION tests.rows_updated(sql TEXT) RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE n INTEGER;
BEGIN
  EXECUTE sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO authenticated, anon;

-- ── Fixtures (as the table owner) ──────────────────────────────────────────
--   A  professional   owner 01, manager 02, technicians 03 and 04
--   B  starter        owner 05                      (the other tenant)
--   F  free forever   owner 07, technician 08
--   S  solo           owner 09, technician 10
--   X  lapsed trial   owner 11
--   R  active trial   owner 12
--   outsider 06 belongs to no shop; 14 is a technician at both A and B.

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'owner-a@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'manager-a@test.local'),
  ('00000000-0000-0000-0000-000000000003', 'tech-a@test.local'),
  ('00000000-0000-0000-0000-000000000004', 'tech2-a@test.local'),
  ('00000000-0000-0000-0000-000000000005', 'owner-b@test.local'),
  ('00000000-0000-0000-0000-000000000006', 'outsider@test.local'),
  ('00000000-0000-0000-0000-000000000007', 'owner-f@test.local'),
  ('00000000-0000-0000-0000-000000000008', 'tech-f@test.local'),
  ('00000000-0000-0000-0000-000000000009', 'owner-s@test.local'),
  ('00000000-0000-0000-0000-000000000010', 'tech-s@test.local'),
  ('00000000-0000-0000-0000-000000000011', 'owner-x@test.local'),
  ('00000000-0000-0000-0000-000000000012', 'owner-r@test.local'),
  ('00000000-0000-0000-0000-000000000014', 'two-shops@test.local');

INSERT INTO public.shops (id, name) VALUES
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Shop A'),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'Shop B'),
  ('aaaaaaaa-0000-0000-0000-00000000000f', 'Shop F'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'Shop S'),
  ('aaaaaaaa-0000-0000-0000-000000000011', 'Shop X'),
  ('aaaaaaaa-0000-0000-0000-000000000012', 'Shop R');

INSERT INTO public.shop_users (shop_id, user_id, role) VALUES
  ('aaaaaaaa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('aaaaaaaa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000002', 'manager'),
  ('aaaaaaaa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000003', 'technician'),
  ('aaaaaaaa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000004', 'technician'),
  ('aaaaaaaa-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000005', 'owner'),
  ('aaaaaaaa-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-000000000007', 'owner'),
  ('aaaaaaaa-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-000000000008', 'technician'),
  ('aaaaaaaa-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000009', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000010', 'technician'),
  ('aaaaaaaa-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000011', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000012', 'owner'),
  -- 14 works at both A and B, as staff at a two-location business do.
  ('aaaaaaaa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000014', 'technician'),
  ('aaaaaaaa-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000014', 'technician');

INSERT INTO public.profiles (id, plan, trial_ends_at) VALUES
  ('00000000-0000-0000-0000-000000000001', 'professional', NULL),
  ('00000000-0000-0000-0000-000000000005', 'starter',      NULL),
  ('00000000-0000-0000-0000-000000000007', 'free',         NULL),
  ('00000000-0000-0000-0000-000000000009', 'solo',         NULL),
  ('00000000-0000-0000-0000-000000000011', 'trial',        now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000012', 'free',         now() + interval '5 days');

INSERT INTO public.customers (id, shop_id, name) VALUES
  ('CUST-A1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Customer in A'),
  ('CUST-B1', 'aaaaaaaa-0000-0000-0000-00000000000b', 'Customer in B');
INSERT INTO public.vehicles (id, shop_id, label) VALUES
  ('bbbbbbbb-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Vehicle in A'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-00000000000b', 'Vehicle in B');
INSERT INTO public.job_cards (id, shop_id, status) VALUES
  ('JC-A1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Booked'),
  ('JC-B1', 'aaaaaaaa-0000-0000-0000-00000000000b', 'Booked');

-- ═══════════════════════════════════════════════════════════════════════════
-- Plan tiers
-- ═══════════════════════════════════════════════════════════════════════════
SELECT tests.ok(public.reminder_plan_tier('aaaaaaaa-0000-0000-0000-00000000000a') = 'team', 'professional is team');
SELECT tests.ok(public.reminder_plan_tier('aaaaaaaa-0000-0000-0000-00000000000b') = 'team', 'starter is team');
SELECT tests.ok(public.reminder_plan_tier('aaaaaaaa-0000-0000-0000-00000000000f') = 'free', 'free forever is free');
SELECT tests.ok(public.reminder_plan_tier('aaaaaaaa-0000-0000-0000-000000000005') = 'solo', 'solo is solo');
SELECT tests.ok(public.reminder_plan_tier('aaaaaaaa-0000-0000-0000-000000000011') = 'free', 'lapsed trial is free');
SELECT tests.ok(public.reminder_plan_tier('aaaaaaaa-0000-0000-0000-000000000012') = 'team', 'active trial is team');

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
SELECT tests.ok(public.reminder_plan_tier('aaaaaaaa-0000-0000-0000-00000000000a') IS NULL,
                'another tenant cannot read a shop''s plan tier');
ROLLBACK;

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. The feature flag ships disabled — and while it is, nothing is reachable
-- ═══════════════════════════════════════════════════════════════════════════
SELECT tests.ok((SELECT count(*) = 1 AND bool_and(NOT enabled) FROM public.feature_flags
                 WHERE flag_key = 'internal_reminders'),
                'internal_reminders is seeded once, disabled');

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT tests.ok(public.internal_reminders_enabled('aaaaaaaa-0000-0000-0000-00000000000a') = false,
                'as shipped, the flag is off for an owner');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'x', now())$$,
                    'REMINDERS_DISABLED', 'as shipped, nobody can create a reminder');
ROLLBACK;

-- The rest of the suite runs with the flag on, as a shop that has enabled it.
UPDATE public.feature_flags SET enabled = true
 WHERE flag_key = 'internal_reminders' AND scope = 'global';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A shop member creates and reads their own reminder
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

INSERT INTO public.shop_reminders (id, shop_id, title, due_at, assigned_to, customer_id, vehicle_id, job_card_id)
VALUES ('cccccccc-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a',
        '  Re-torque wheel nuts  ', now() + interval '1 day',
        '00000000-0000-0000-0000-000000000003', 'CUST-A1',
        'bbbbbbbb-0000-0000-0000-0000000000a1', 'JC-A1');

SELECT tests.ok((SELECT count(*) FROM public.shop_reminders WHERE id = 'cccccccc-0000-0000-0000-0000000000a1') = 1,
                'technician reads the reminder they created');
SELECT tests.ok((SELECT title FROM public.shop_reminders WHERE id = 'cccccccc-0000-0000-0000-0000000000a1') = 'Re-torque wheel nuts',
                'title is trimmed');
SELECT tests.ok((SELECT created_by FROM public.shop_reminders WHERE id = 'cccccccc-0000-0000-0000-0000000000a1') = '00000000-0000-0000-0000-000000000003',
                'created_by is the caller');
SELECT tests.ok((SELECT priority FROM public.shop_reminders WHERE id = 'cccccccc-0000-0000-0000-0000000000a1') = 'normal',
                'priority defaults to normal');
SELECT tests.ok((SELECT count(*) FROM public.shop_reminder_events
                 WHERE reminder_id = 'cccccccc-0000-0000-0000-0000000000a1' AND action = 'created') = 1,
                'creation is recorded in history');

-- Forging the creator is ignored, not trusted.
INSERT INTO public.shop_reminders (id, shop_id, title, due_at, created_by)
VALUES ('cccccccc-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a',
        'Forged creator', now(), '00000000-0000-0000-0000-000000000001');
SELECT tests.ok((SELECT created_by FROM public.shop_reminders WHERE id = 'cccccccc-0000-0000-0000-0000000000a2') = '00000000-0000-0000-0000-000000000003',
                'a forged created_by is replaced by the real caller');
COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Cross-tenant: read, count, insert, update, complete, reopen, links
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);

SELECT tests.ok((SELECT count(*) FROM public.shop_reminders
                 WHERE shop_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 0,
                'another tenant''s owner reads and counts nothing in shop A');
SELECT tests.ok((SELECT count(*) FROM public.shop_reminder_events
                 WHERE shop_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 0,
                'another tenant''s owner reads no shop A history');
SELECT tests.ok(tests.rows_updated($$UPDATE public.shop_reminders SET title = 'hijacked'
                 WHERE id = 'cccccccc-0000-0000-0000-0000000000a1'$$) = 0,
                'another tenant cannot edit a shop A reminder');
SELECT tests.ok(tests.rows_updated($$UPDATE public.shop_reminders SET status = 'completed'
                 WHERE id = 'cccccccc-0000-0000-0000-0000000000a1'$$) = 0,
                'another tenant cannot complete a shop A reminder');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'plant', now())$$,
                    'row-level security', 'another tenant cannot insert into shop A');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at, customer_id)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000b', 'x', now(), 'CUST-A1')$$,
                    'REMINDER_LINK_INVALID:customer', 'a customer from another shop cannot be linked');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at, vehicle_id)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000b', 'x', now(), 'bbbbbbbb-0000-0000-0000-0000000000a1')$$,
                    'REMINDER_LINK_INVALID:vehicle', 'a vehicle from another shop cannot be linked');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at, job_card_id)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000b', 'x', now(), 'JC-A1')$$,
                    'REMINDER_LINK_INVALID:job_card', 'a job card from another shop cannot be linked');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at, customer_id)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000b', 'x', now(), 'CUST-NOPE')$$,
                    'REMINDER_LINK_INVALID:customer', 'a missing customer gets the same error as a foreign one');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at, assigned_to)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000b', 'x', now(), '00000000-0000-0000-0000-000000000003')$$,
                    'REMINDER_ASSIGNEE_INVALID', 'a member of another shop cannot be assigned');
ROLLBACK;

-- Moving a reminder to another shop, even your own other shop, is refused.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT tests.throws($$UPDATE public.shop_reminders SET shop_id = 'aaaaaaaa-0000-0000-0000-00000000000b'
                    WHERE id = 'cccccccc-0000-0000-0000-0000000000a1'$$,
                    'REMINDER_IMMUTABLE', 'a reminder cannot be moved between shops');
-- Linking a record from another shop on edit is refused too.
SELECT tests.throws($$UPDATE public.shop_reminders SET customer_id = 'CUST-B1'
                    WHERE id = 'cccccccc-0000-0000-0000-0000000000a1'$$,
                    'REMINDER_LINK_INVALID:customer', 'an edit cannot link another shop''s customer');
ROLLBACK;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Non-members and anonymous callers
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);
SELECT tests.ok((SELECT count(*) FROM public.shop_reminders) = 0, 'a user with no shop sees nothing');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'x', now())$$,
                    'row-level security', 'a user with no shop cannot create');
ROLLBACK;

BEGIN;
SET LOCAL ROLE anon;
SELECT tests.throws($$SELECT count(*) FROM public.shop_reminders$$,
                    'permission denied', 'anonymous callers cannot read reminders');
SELECT tests.throws($$SELECT count(*) FROM public.shop_reminder_events$$,
                    'permission denied', 'anonymous callers cannot read history');
ROLLBACK;

-- A removed member (shop_users row deleted) loses access immediately.
BEGIN;
DELETE FROM public.shop_users
 WHERE shop_id = 'aaaaaaaa-0000-0000-0000-00000000000a'
   AND user_id = '00000000-0000-0000-0000-000000000003';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
SELECT tests.ok((SELECT count(*) FROM public.shop_reminders) = 0,
                'a removed member no longer sees the reminders they created');
SELECT tests.ok(tests.rows_updated($$UPDATE public.shop_reminders SET status = 'completed'
                 WHERE id = 'cccccccc-0000-0000-0000-0000000000a1'$$) = 0,
                'a removed member cannot complete them either');
ROLLBACK;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 / 8. Assignment: managers can, staff cannot, and staff visibility
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
INSERT INTO public.shop_reminders (id, shop_id, title, due_at, assigned_to, priority)
VALUES ('cccccccc-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-00000000000a',
        'Call supplier about brake pads', now() + interval '2 hours',
        '00000000-0000-0000-0000-000000000004', 'high');
SELECT tests.ok(true, 'a manager on a team plan assigns to a colleague');
SELECT tests.ok((SELECT count(*) FROM public.shop_reminders
                 WHERE shop_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 3,
                'a manager sees every reminder in the shop');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT tests.ok((SELECT count(*) FROM public.shop_reminders) = 1,
                'a technician sees only what is theirs, not a colleague''s personal reminders');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at, assigned_to)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'x', now(), '00000000-0000-0000-0000-000000000003')$$,
                    'REMINDER_ASSIGN_FORBIDDEN|row-level security', 'a technician cannot assign to someone else');
SELECT tests.throws($$UPDATE public.shop_reminders SET assigned_to = '00000000-0000-0000-0000-000000000003'
                    WHERE id = 'cccccccc-0000-0000-0000-0000000000a3'$$,
                    'REMINDER_ASSIGN_FORBIDDEN|row-level security', 'a technician cannot reassign to someone else');
SELECT tests.ok(tests.rows_updated($$UPDATE public.shop_reminders SET status = 'completed'
                 WHERE id = 'cccccccc-0000-0000-0000-0000000000a3'$$) = 1,
                'the assignee can complete a reminder assigned to them');
SELECT tests.ok((SELECT count(*) FROM public.shop_reminder_events
                 WHERE reminder_id = 'cccccccc-0000-0000-0000-0000000000a1') = 0,
                'a technician cannot read a colleague''s reminder history');
ROLLBACK;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5 / 6. Free Forever: 3 open, 4th refused, complete frees a slot, reopen
--        cannot bypass, multi-row inserts cannot bypass
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000007', true);
INSERT INTO public.shop_reminders (id, shop_id, title, due_at) VALUES
  ('ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000f', 'one',   now()),
  ('ffffffff-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000f', 'two',   now()),
  ('ffffffff-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-00000000000f', 'three', now());
SELECT tests.ok(true, 'free forever creates 3 reminders');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000f', 'four', now())$$,
                    'REMINDER_LIMIT:3', 'free forever: the 4th open reminder is refused');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at, assigned_to)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000f', 'x', now(), '00000000-0000-0000-0000-000000000008')$$,
                    'REMINDER_TEAM_PLAN', 'free forever cannot assign to a team member');

UPDATE public.shop_reminders SET status = 'completed' WHERE id = 'ffffffff-0000-0000-0000-000000000001';
INSERT INTO public.shop_reminders (id, shop_id, title, due_at)
VALUES ('ffffffff-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-00000000000f', 'four', now());
SELECT tests.ok(true, 'completing one frees a slot for a new reminder');
SELECT tests.throws($$UPDATE public.shop_reminders SET status = 'open'
                    WHERE id = 'ffffffff-0000-0000-0000-000000000001'$$,
                    'REMINDER_LIMIT:3', 'reopening cannot take the shop past the cap');
UPDATE public.shop_reminders SET status = 'cancelled' WHERE id = 'ffffffff-0000-0000-0000-000000000002';
SELECT tests.ok((SELECT count(*) FROM public.shop_reminders WHERE shop_id = 'aaaaaaaa-0000-0000-0000-00000000000f' AND status = 'open') = 2,
                'cancelled reminders do not count as open');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at) VALUES
                    ('aaaaaaaa-0000-0000-0000-00000000000f', 'batch1', now()),
                    ('aaaaaaaa-0000-0000-0000-00000000000f', 'batch2', now())$$,
                    'REMINDER_LIMIT:3', 'a two-row insert cannot slip past the cap');
SELECT tests.ok((SELECT count(*) FROM public.shop_reminders WHERE shop_id = 'aaaaaaaa-0000-0000-0000-00000000000f' AND status = 'open') = 2,
                'the refused batch left nothing behind');
-- Editing an open reminder is not "opening" one, so it is never capped.
UPDATE public.shop_reminders SET title = 'three, renamed' WHERE id = 'ffffffff-0000-0000-0000-000000000003';
SELECT tests.ok(true, 'editing an open reminder is never capped');
ROLLBACK;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Solo: unlimited personal reminders, no team assignment
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000009', true);
INSERT INTO public.shop_reminders (shop_id, title, due_at, assigned_to)
SELECT 'aaaaaaaa-0000-0000-0000-000000000005', 'solo ' || g, now(), '00000000-0000-0000-0000-000000000009'
FROM generate_series(1, 6) g;
SELECT tests.ok((SELECT count(*) FROM public.shop_reminders WHERE shop_id = 'aaaaaaaa-0000-0000-0000-000000000005' AND status = 'open') = 6,
                'solo creates more than 3 open self-assigned reminders');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at, assigned_to)
                    VALUES ('aaaaaaaa-0000-0000-0000-000000000005', 'x', now(), '00000000-0000-0000-0000-000000000010')$$,
                    'REMINDER_TEAM_PLAN', 'solo cannot assign to another member even though one exists');
ROLLBACK;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Downgrade: shop A drops to Free Forever with 5 open reminders
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
-- Two more open reminders so A holds 5 open (over the free cap), two of them
-- assigned to a colleague while the plan allowed it.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
INSERT INTO public.shop_reminders (id, shop_id, title, due_at, assigned_to) VALUES
  ('cccccccc-0000-0000-0000-0000000000a4', 'aaaaaaaa-0000-0000-0000-00000000000a', 'pre-downgrade 1', now(), '00000000-0000-0000-0000-000000000004'),
  ('cccccccc-0000-0000-0000-0000000000a5', 'aaaaaaaa-0000-0000-0000-00000000000a', 'pre-downgrade 2', now(), NULL);
RESET ROLE;
UPDATE public.profiles SET plan = 'free' WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT tests.ok(public.reminder_plan_tier('aaaaaaaa-0000-0000-0000-00000000000a') = 'free', 'shop A is now free');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT tests.ok((SELECT count(*) FROM public.shop_reminders WHERE id = 'cccccccc-0000-0000-0000-0000000000a4') = 1,
                'after downgrade the assignee still sees their reminder');
SELECT tests.ok(tests.rows_updated($$UPDATE public.shop_reminders SET status = 'completed'
                 WHERE id = 'cccccccc-0000-0000-0000-0000000000a4'$$) = 1,
                'after downgrade the assignee can still complete it');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT tests.ok(tests.rows_updated($$UPDATE public.shop_reminders SET title = 'call supplier (edited)'
                 WHERE id = 'cccccccc-0000-0000-0000-0000000000a3'$$) = 1,
                'after downgrade a colleague-assigned reminder can still be edited');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'new', now())$$,
                    'REMINDER_LIMIT:3', 'after downgrade a new reminder past the cap is refused');
SELECT tests.throws($$UPDATE public.shop_reminders SET assigned_to = '00000000-0000-0000-0000-000000000003'
                    WHERE id = 'cccccccc-0000-0000-0000-0000000000a5'$$,
                    'REMINDER_TEAM_PLAN', 'after downgrade new team assignment is refused');
SELECT tests.throws($$UPDATE public.shop_reminders SET status = 'open'
                    WHERE id = 'cccccccc-0000-0000-0000-0000000000a4'$$,
                    'REMINDER_LIMIT:3', 'after downgrade reopening past the cap is refused');
RESET ROLE;
SELECT tests.ok((SELECT count(*) FROM public.shop_reminders WHERE shop_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 5,
                'the downgrade deleted nothing');
ROLLBACK;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. Input validation at the database
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', repeat('x', 161), now())$$,
                    'shop_reminders_title_length', 'a 161-character title is refused');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', '   ', now())$$,
                    'shop_reminders_title_length', 'a blank title is refused');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at, notes)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'x', now(), repeat('n', 2001))$$,
                    'shop_reminders_notes_length', '2001 characters of notes are refused');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at, priority)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'x', now(), 'urgent')$$,
                    'shop_reminders_priority_check', 'an unknown priority is refused');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'x', NULL)$$,
                    'null value in column "due_at"', 'a missing due time is refused');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'x', 'next tuesday-ish')$$,
                    'invalid input syntax for type timestamp', 'a malformed due time is refused');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at, vehicle_id)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'x', now(), 'not-a-uuid')$$,
                    'invalid input syntax for type uuid', 'a malformed vehicle id is refused');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at, status)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'x', now(), 'completed')$$,
                    'REMINDER_NEW_MUST_BE_OPEN', 'a reminder cannot be created already completed');
SELECT tests.throws($$UPDATE public.shop_reminders SET status = 'sent'
                    WHERE id = 'cccccccc-0000-0000-0000-0000000000a1'$$,
                    'shop_reminders_status_check', 'an invented status is refused');
SELECT tests.throws($$DELETE FROM public.shop_reminders WHERE id = 'cccccccc-0000-0000-0000-0000000000a1'$$,
                    'permission denied', 'reminders cannot be hard-deleted');
SELECT tests.throws($$INSERT INTO public.shop_reminder_events (shop_id, reminder_id, action)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'cccccccc-0000-0000-0000-0000000000a1', 'completed')$$,
                    'permission denied', 'history cannot be written by a client');
ROLLBACK;

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. Completion and reopening are idempotent; history is accurate
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

-- A client-supplied completion time and completer are ignored.
UPDATE public.shop_reminders
   SET status = 'completed', completed_at = '2000-01-01', completed_by = '00000000-0000-0000-0000-000000000001'
 WHERE id = 'cccccccc-0000-0000-0000-0000000000a1';
SELECT tests.ok((SELECT completed_by FROM public.shop_reminders WHERE id = 'cccccccc-0000-0000-0000-0000000000a1') = '00000000-0000-0000-0000-000000000003',
                'completed_by is the real caller, not the value sent');
SELECT tests.ok((SELECT completed_at > now() - interval '1 minute' FROM public.shop_reminders WHERE id = 'cccccccc-0000-0000-0000-0000000000a1'),
                'completed_at is stamped by the database, not back-dated');

UPDATE public.shop_reminders SET status = 'completed' WHERE id = 'cccccccc-0000-0000-0000-0000000000a1';
UPDATE public.shop_reminders SET status = 'completed' WHERE id = 'cccccccc-0000-0000-0000-0000000000a1';
SELECT tests.ok((SELECT count(*) FROM public.shop_reminder_events
                 WHERE reminder_id = 'cccccccc-0000-0000-0000-0000000000a1' AND action = 'completed') = 1,
                'completing three times records one completion');

UPDATE public.shop_reminders SET status = 'open' WHERE id = 'cccccccc-0000-0000-0000-0000000000a1';
UPDATE public.shop_reminders SET status = 'open' WHERE id = 'cccccccc-0000-0000-0000-0000000000a1';
SELECT tests.ok((SELECT count(*) FROM public.shop_reminder_events
                 WHERE reminder_id = 'cccccccc-0000-0000-0000-0000000000a1' AND action = 'reopened') = 1,
                'reopening twice records one reopen');
SELECT tests.ok((SELECT completed_at IS NULL AND completed_by IS NULL FROM public.shop_reminders WHERE id = 'cccccccc-0000-0000-0000-0000000000a1'),
                'reopening clears the completion stamp');

UPDATE public.shop_reminders SET due_at = due_at + interval '1 day', priority = 'high'
 WHERE id = 'cccccccc-0000-0000-0000-0000000000a1';
SELECT tests.ok((SELECT changed_fields FROM public.shop_reminder_events
                 WHERE reminder_id = 'cccccccc-0000-0000-0000-0000000000a1' AND action = 'updated') = ARRAY['due_at', 'priority'],
                'an edit records which fields changed');
SELECT tests.ok((SELECT bool_and(actor_id = '00000000-0000-0000-0000-000000000003') FROM public.shop_reminder_events
                 WHERE reminder_id = 'cccccccc-0000-0000-0000-0000000000a1' AND action <> 'created'),
                'every change is attributed to the caller');
SELECT tests.ok((SELECT string_agg(action, ',' ORDER BY created_at, action) FROM public.shop_reminder_events
                 WHERE reminder_id = 'cccccccc-0000-0000-0000-0000000000a1') IS NOT NULL,
                'history reads back for the reminder''s own user');
ROLLBACK;

-- ═══════════════════════════════════════════════════════════════════════════
-- Retention: deleting a linked record keeps the reminder
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
DELETE FROM public.customers WHERE id = 'CUST-A1';
DELETE FROM public.job_cards WHERE id = 'JC-A1';
SELECT tests.ok((SELECT customer_id IS NULL AND job_card_id IS NULL AND vehicle_id IS NOT NULL
                 FROM public.shop_reminders WHERE id = 'cccccccc-0000-0000-0000-0000000000a1'),
                'deleting a customer or job card unlinks the reminder instead of deleting it');
ROLLBACK;

-- ═══════════════════════════════════════════════════════════════════════════
-- 13 (continued). Flag OFF fails closed: reads, writes and history, while the
-- records themselves are kept.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
UPDATE public.feature_flags SET enabled = false
 WHERE flag_key = 'internal_reminders' AND scope = 'global';
SELECT tests.ok((SELECT count(*) FROM public.shop_reminders) > 0, 'records exist before the checks below');
CREATE TEMP TABLE kept AS SELECT count(*) AS n FROM public.shop_reminders;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
SELECT tests.ok((SELECT count(*) FROM public.shop_reminders) = 0, 'flag off: the creator reads nothing');
SELECT tests.ok((SELECT count(*) FROM public.shop_reminder_events) = 0, 'flag off: no history is readable');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'x', now())$$,
                    'REMINDERS_DISABLED', 'flag off: a direct insert is refused');
SELECT tests.ok(tests.rows_updated($$UPDATE public.shop_reminders SET title = 'edited while off'
                 WHERE id = 'cccccccc-0000-0000-0000-0000000000a1'$$) = 0, 'flag off: a direct edit matches nothing');
SELECT tests.ok(tests.rows_updated($$UPDATE public.shop_reminders SET status = 'completed'
                 WHERE id = 'cccccccc-0000-0000-0000-0000000000a1'$$) = 0, 'flag off: a direct complete matches nothing');
SELECT tests.ok(tests.rows_updated($$UPDATE public.shop_reminders SET status = 'cancelled'
                 WHERE id = 'cccccccc-0000-0000-0000-0000000000a1'$$) = 0, 'flag off: a direct cancel matches nothing');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT tests.ok((SELECT count(*) FROM public.shop_reminders) = 0, 'flag off: the owner reads nothing either');
SELECT tests.ok(tests.rows_updated($$UPDATE public.shop_reminders SET status = 'open'
                 WHERE id = 'cccccccc-0000-0000-0000-0000000000a3'$$) = 0, 'flag off: a direct reopen matches nothing');
RESET ROLE;
SELECT tests.ok((SELECT count(*) FROM public.shop_reminders) = (SELECT n FROM kept),
                'flag off: every record is kept');
SELECT tests.ok((SELECT title FROM public.shop_reminders WHERE id = 'cccccccc-0000-0000-0000-0000000000a1') <> 'edited while off',
                'flag off: nothing was changed behind the refusals');
-- Deleting a linked record must never be blocked by the flag.
DELETE FROM public.job_cards WHERE id = 'JC-A1';
SELECT tests.ok((SELECT job_card_id IS NULL FROM public.shop_reminders WHERE id = 'cccccccc-0000-0000-0000-0000000000a1'),
                'flag off: deleting a linked job card still works and unlinks the reminder');
ROLLBACK;

-- Flag ON for one shop only: that shop works, the other stays closed.
BEGIN;
UPDATE public.feature_flags SET enabled = false
 WHERE flag_key = 'internal_reminders' AND scope = 'global';
INSERT INTO public.feature_flags (flag_key, enabled, scope, shop_id)
VALUES ('internal_reminders', true, 'shop', 'aaaaaaaa-0000-0000-0000-00000000000a');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
SELECT tests.ok((SELECT count(*) FROM public.shop_reminders WHERE id = 'cccccccc-0000-0000-0000-0000000000a1') = 1,
                'shop-scoped on: that shop''s member reads their reminder');
INSERT INTO public.shop_reminders (shop_id, title, due_at)
VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'allowed while on for this shop', now() + interval '1 day');
SELECT tests.ok(true, 'shop-scoped on: that shop''s member creates');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000b', 'x', now())$$,
                    'REMINDERS_DISABLED', 'shop-scoped on: another shop stays off');
ROLLBACK;

-- A role row switching technicians off beats the shop being on.
BEGIN;
INSERT INTO public.feature_flags (flag_key, enabled, scope, role)
VALUES ('internal_reminders', false, 'role', 'technician');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
SELECT tests.ok((SELECT count(*) FROM public.shop_reminders) = 0, 'role off: a technician is shut out');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT tests.ok((SELECT count(*) FROM public.shop_reminders) > 0, 'role off for technicians: a manager still works');
ROLLBACK;

-- ═══════════════════════════════════════════════════════════════════════════
-- Shop context: a user in two shops, and a user in one
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000014', true);
-- Working in A, the B location's records cannot be linked, and the refusal is
-- the same as for a record that does not exist at all.
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at, customer_id)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'x', now(), 'CUST-B1')$$,
                    'REMINDER_LINK_INVALID:customer', 'two shops: working in A, B''s customer cannot be linked');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at, vehicle_id)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'x', now(), 'bbbbbbbb-0000-0000-0000-0000000000b1')$$,
                    'REMINDER_LINK_INVALID:vehicle', 'two shops: working in A, B''s vehicle cannot be linked');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at, job_card_id)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'x', now(), 'JC-B1')$$,
                    'REMINDER_LINK_INVALID:job_card', 'two shops: working in A, B''s job card cannot be linked');
-- Owner 05 belongs to B only, so is not assignable in A, even by a manager.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at, assigned_to)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'x', now(), '00000000-0000-0000-0000-000000000005')$$,
                    'REMINDER_ASSIGNEE_INVALID', 'a member of only the other shop cannot be assigned');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000014', true);
-- Explicitly in B, B's customer links fine.
INSERT INTO public.shop_reminders (id, shop_id, title, due_at, customer_id)
VALUES ('cccccccc-0000-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-00000000000b', 'B work', now() + interval '1 day', 'CUST-B1');
SELECT tests.ok((SELECT shop_id FROM public.shop_reminders WHERE id = 'cccccccc-0000-0000-0000-0000000000b1') = 'aaaaaaaa-0000-0000-0000-00000000000b',
                'two shops: a reminder created in B stays in B');
SELECT tests.throws($$UPDATE public.shop_reminders SET shop_id = 'aaaaaaaa-0000-0000-0000-00000000000a'
                    WHERE id = 'cccccccc-0000-0000-0000-0000000000b1'$$,
                    'REMINDER_IMMUTABLE', 'two shops: it cannot be moved to the other shop afterwards');
-- One-shop user: owner 05 (B only) cannot create in A at all.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at)
                    VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'x', now())$$,
                    'row-level security', 'one shop: cannot create in a shop they do not belong to, and is not told why');
SELECT tests.ok(public.internal_reminders_enabled('aaaaaaaa-0000-0000-0000-00000000000a') = false,
                'one shop: the flag reads off for a shop they do not belong to');
ROLLBACK;

-- ═══════════════════════════════════════════════════════════════════════════
-- Hardening: functions and grants
-- ═══════════════════════════════════════════════════════════════════════════
SELECT tests.ok((SELECT bool_and(p.proconfig @> ARRAY['search_path=""']) FROM pg_proc p
                 WHERE p.proname IN ('reminders_can_manage_shop', 'reminder_plan_tier', 'internal_reminders_enabled',
                                     'shop_reminders_guard', 'shop_reminders_record_event')),
                'every reminder function pins an empty search_path');
SELECT tests.ok(NOT has_function_privilege('authenticated', 'public.shop_reminders_guard()', 'EXECUTE')
            AND NOT has_function_privilege('anon', 'public.shop_reminders_guard()', 'EXECUTE')
            AND NOT has_function_privilege('authenticated', 'public.shop_reminders_record_event()', 'EXECUTE'),
                'the Data API roles cannot execute the trigger functions');
SELECT tests.ok(NOT has_function_privilege('anon', 'public.internal_reminders_enabled(uuid)', 'EXECUTE')
            AND NOT has_function_privilege('anon', 'public.reminder_plan_tier(uuid)', 'EXECUTE')
            AND NOT has_function_privilege('anon', 'public.reminders_can_manage_shop(uuid)', 'EXECUTE'),
                'anon cannot execute any reminder helper');
SELECT tests.ok((SELECT bool_and(qual IS NOT NULL AND with_check IS NOT NULL) FROM pg_policies
                 WHERE tablename = 'shop_reminders' AND cmd = 'UPDATE'),
                'the update policy has both USING and WITH CHECK');
SELECT tests.ok(has_table_privilege('authenticated', 'public.shop_reminders', 'SELECT')
            AND has_table_privilege('authenticated', 'public.shop_reminders', 'INSERT')
            AND has_table_privilege('authenticated', 'public.shop_reminders', 'UPDATE')
            AND NOT has_table_privilege('authenticated', 'public.shop_reminders', 'DELETE')
            AND NOT has_table_privilege('authenticated', 'public.shop_reminders', 'TRUNCATE'),
                'authenticated has exactly select, insert and update');

-- ═══════════════════════════════════════════════════════════════════════════
-- Unprovable entitlement fails closed. E1 has no owner at all (a manager and
-- a technician only); E2's owner has no profiles row; E3's owner has a NULL
-- plan. Each must read as Free Forever: no team assignment, 3 open.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000021', 'e1-manager@test.local'),
  ('00000000-0000-0000-0000-000000000022', 'e1-tech@test.local'),
  ('00000000-0000-0000-0000-000000000023', 'e2-owner-no-profile@test.local'),
  ('00000000-0000-0000-0000-000000000024', 'e2-tech@test.local'),
  ('00000000-0000-0000-0000-000000000025', 'e3-owner-null-plan@test.local'),
  ('00000000-0000-0000-0000-000000000026', 'e3-tech@test.local');
INSERT INTO public.shops (id, name) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000e1', 'No owner'),
  ('aaaaaaaa-0000-0000-0000-0000000000e2', 'Owner without profile'),
  ('aaaaaaaa-0000-0000-0000-0000000000e3', 'Owner with NULL plan');
INSERT INTO public.shop_users (shop_id, user_id, role) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000021', 'manager'),
  ('aaaaaaaa-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000022', 'technician'),
  ('aaaaaaaa-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000023', 'owner'),
  ('aaaaaaaa-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000024', 'technician'),
  ('aaaaaaaa-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-000000000025', 'owner'),
  ('aaaaaaaa-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-000000000026', 'technician');
-- E2's owner deliberately gets no profiles row. E3's owner has one, plan NULL.
INSERT INTO public.profiles (id, plan, trial_ends_at) VALUES
  ('00000000-0000-0000-0000-000000000025', NULL, NULL),
  -- The E1 manager has a PAID profile of their own: a non-owner's plan must
  -- not count for the shop.
  ('00000000-0000-0000-0000-000000000021', 'business', NULL);

SELECT tests.ok(public.reminder_plan_tier('aaaaaaaa-0000-0000-0000-0000000000e1') = 'free', 'no owner: free, not team');
SELECT tests.ok(public.reminder_plan_tier('aaaaaaaa-0000-0000-0000-0000000000e2') = 'free', 'owner without a profile: free, not team');
SELECT tests.ok(public.reminder_plan_tier('aaaaaaaa-0000-0000-0000-0000000000e3') = 'free', 'owner with a NULL plan: free, not team');

-- The same three checks for each shop, as the manager/owner who would be
-- allowed to assign on a paid plan.
BEGIN;
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000021', true);
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at, assigned_to)
                    VALUES ('aaaaaaaa-0000-0000-0000-0000000000e1', 'x', now(), '00000000-0000-0000-0000-000000000022')$$,
                    'REMINDER_TEAM_PLAN', 'no owner: a manager (even one with a paid profile) cannot assign a teammate');
INSERT INTO public.shop_reminders (shop_id, title, due_at)
SELECT 'aaaaaaaa-0000-0000-0000-0000000000e1', 'e1 ' || g, now() FROM generate_series(1, 3) g;
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at)
                    VALUES ('aaaaaaaa-0000-0000-0000-0000000000e1', 'fourth', now())$$,
                    'REMINDER_LIMIT:3', 'no owner: the 4th open reminder is refused');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000023', true);
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at, assigned_to)
                    VALUES ('aaaaaaaa-0000-0000-0000-0000000000e2', 'x', now(), '00000000-0000-0000-0000-000000000024')$$,
                    'REMINDER_TEAM_PLAN', 'owner without a profile cannot assign a teammate');
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at)
                    SELECT 'aaaaaaaa-0000-0000-0000-0000000000e2', 'e2 ' || g, now() FROM generate_series(1, 4) g$$,
                    'REMINDER_LIMIT:3', 'owner without a profile: four in one statement are refused');
SELECT tests.ok((SELECT count(*) FROM public.shop_reminders WHERE shop_id = 'aaaaaaaa-0000-0000-0000-0000000000e2') = 0,
                'owner without a profile: the refused batch left nothing behind');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000025', true);
SELECT tests.throws($$INSERT INTO public.shop_reminders (shop_id, title, due_at, assigned_to)
                    VALUES ('aaaaaaaa-0000-0000-0000-0000000000e3', 'x', now(), '00000000-0000-0000-0000-000000000026')$$,
                    'REMINDER_TEAM_PLAN', 'owner with a NULL plan cannot assign a teammate');
INSERT INTO public.shop_reminders (id, shop_id, title, due_at) VALUES
  ('cccccccc-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-0000000000e3', 'e3 1', now()),
  ('cccccccc-0000-0000-0000-0000000000e2', 'aaaaaaaa-0000-0000-0000-0000000000e3', 'e3 2', now()),
  ('cccccccc-0000-0000-0000-0000000000e3', 'aaaaaaaa-0000-0000-0000-0000000000e3', 'e3 3', now());
UPDATE public.shop_reminders SET status = 'completed' WHERE id = 'cccccccc-0000-0000-0000-0000000000e1';
INSERT INTO public.shop_reminders (shop_id, title, due_at) VALUES ('aaaaaaaa-0000-0000-0000-0000000000e3', 'e3 4', now());
SELECT tests.throws($$UPDATE public.shop_reminders SET status = 'open' WHERE id = 'cccccccc-0000-0000-0000-0000000000e1'$$,
                    'REMINDER_LIMIT:3', 'owner with a NULL plan: reopening cannot bypass the cap');
ROLLBACK;

\echo ALL REMINDER DATABASE TESTS PASSED
