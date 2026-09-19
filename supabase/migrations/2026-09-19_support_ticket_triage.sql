-- ===========================================================================
-- support_ticket_triage_events — the owner's real / test / spam marker for
-- support tickets, as an append-only audit trail
--
-- NOT APPLIED. Prepared locally for review; run it in the Supabase SQL Editor
-- only after explicit approval.
--
-- WHY THIS IS NEEDED
-- ------------------
-- The owner support queue has to tell "a shop asked a real question" from old
-- TEST / BUG records without guessing. Nothing in the current schema can say
-- so: `kind` is 'chat' | 'bug', `status` is 'open' | 'answered' | 'closed', and
-- there is no test/spam field (shop_audit_leads already has a constrained
-- 'spam' status; tickets do not). Inferring it from a subject, a shop name or
-- message text would misclassify real customers, so the portal only treats a
-- ticket as test or spam when an owner has explicitly marked it.
--
-- WHY A SEPARATE TABLE, NOT A COLUMN ON support_tickets
-- -----------------------------------------------------
--   * Customers can already read their own tickets through RLS. A column would
--     let a shop see that its own ticket had been marked "spam" or "test", and
--     row-level policies cannot hide one column. A table nobody but the service
--     role can touch cannot leak.
--   * Customers can already INSERT tickets. A column would need the insert policy
--     rewritten to stop a shop pre-classifying its own ticket. This design does
--     not touch support_tickets or any of its policies at all.
--   * A column records only the current value. This records who set what and
--     when, and keeps the history.
--
-- WHAT IT DOES
-- ------------
--   1. Creates public.support_ticket_triage_events: one row per marking. The
--      CURRENT marker of a ticket is its newest row (highest id). No row, or a
--      newest row of 'unreviewed', means "unreviewed".
--   2. Constrains the marker to real | test | spam | unreviewed ('unreviewed'
--      clears a mistaken marking; it is a new row, never an edit).
--   3. Enables RLS with NO policy and revokes every privilege from anon and
--      authenticated, so neither can read or write it. Only service_role, which
--      is what the owner-only API route uses, can SELECT and INSERT. There is no
--      UPDATE or DELETE grant: history cannot be edited or removed.
--   4. Changes nothing else. No existing row, table, policy or grant is touched,
--      and nothing is backfilled or reclassified.
--
-- The application is written for this migration NOT being applied yet: it
-- feature-detects the table and shows every ticket as "unreviewed" until it
-- exists. Applying it changes no numbers by itself.
--
-- RISK / LOCKING
-- --------------
--   Creating the table takes a brief SHARE ROW EXCLUSIVE lock on support_tickets
--   (for the foreign key). That table is small and the lock lasts for the one
--   transaction. Nothing else is altered.
--
-- Deleting a ticket (or its shop) cascades to that ticket's marker history.
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.support_ticket_triage_events (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id   UUID        NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  triage      TEXT        NOT NULL CHECK (triage IN ('real', 'test', 'spam', 'unreviewed')),
  -- The platform owner who made the change (their sign-in email, from the server session).
  set_by      TEXT        NOT NULL CHECK (length(btrim(set_by)) > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.support_ticket_triage_events IS
  'Append-only owner markings of support tickets (real | test | spam | unreviewed). Newest row per ticket is current. Service role only; customers have no access.';

CREATE INDEX IF NOT EXISTS support_ticket_triage_events_ticket_idx
  ON public.support_ticket_triage_events (ticket_id, id DESC);

ALTER TABLE public.support_ticket_triage_events ENABLE ROW LEVEL SECURITY;

-- Supabase grants new public tables to anon and authenticated by default; take that back.
REVOKE ALL ON public.support_ticket_triage_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.support_ticket_triage_events TO service_role;

-- RLS with no policy is only a guarantee if RLS is actually on and the grants are gone. Asserted, not assumed.
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.support_ticket_triage_events'::regclass) THEN
    RAISE EXCEPTION 'RLS did not enable on support_ticket_triage_events';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.support_ticket_triage_events'::regclass) THEN
    RAISE EXCEPTION 'support_ticket_triage_events must have no policies';
  END IF;
  IF has_table_privilege('anon', 'public.support_ticket_triage_events', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.support_ticket_triage_events', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'anon/authenticated still hold a privilege on support_ticket_triage_events';
  END IF;
END $$;

COMMIT;

-- ── Verification (read-only) ────────────────────────────────────────────────
--
--   Table present, RLS on, no policies, nothing marked yet:
--     SELECT c.relrowsecurity,
--            (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
--            (SELECT count(*) FROM public.support_ticket_triage_events) AS markings
--     FROM pg_class c WHERE c.oid = 'public.support_ticket_triage_events'::regclass;
--     -- expect: true, 0, 0
--
--   Who can touch it (expect only service_role, SELECT and INSERT):
--     SELECT grantee, privilege_type FROM information_schema.role_table_grants
--     WHERE table_schema = 'public' AND table_name = 'support_ticket_triage_events';
--
--   support_tickets is unchanged: its policies are exactly those in 2026-08-03_support_tickets.sql.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   Nothing outside this table was changed, so removing it restores the previous state.
--
--   DROP TABLE IF EXISTS public.support_ticket_triage_events;
--
--   This discards every marking and its history.
