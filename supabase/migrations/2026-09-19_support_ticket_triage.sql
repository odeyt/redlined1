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
--   3. Enables RLS with NO policy and revokes EVERY privilege (including the ones
--      Supabase grants by default) from anon, authenticated and service_role, then
--      grants service_role SELECT and INSERT only, which is what the owner-only API
--      route uses. History cannot be edited or removed by any API role. The
--      transaction asserts this against every privilege type and aborts otherwise.
--   4. Adds an append-only TRIGGER, the same pattern payments and audit_events use
--      (2026-08-16_m1, 2026-08-17_m2, 2026-08-17_m6): UPDATE, DELETE and TRUNCATE are
--      refused for EVERYONE, including the table owner and the foreign-key cascade,
--      except inside purge_synthetic_shop(), which only ever purges '[E2E]' test shops.
--      So the audit history is retained even if someone tries to delete a marked ticket
--      or shop: that delete fails, with nothing removed. See "DELETION" below.
--   5. Changes nothing else. No existing row, table, policy or grant is touched,
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
-- DELETION
-- --------
--   The application never deletes a support ticket (there is no such code path); tickets
--   and their markers disappear only when a shop is deleted or by hand in SQL. The foreign
--   key below stays ON DELETE CASCADE, but the append-only trigger makes that cascade refuse
--   to remove marker rows, so:
--     * a ticket or shop that has ANY marking cannot be deleted (error 42501, nothing removed),
--       exactly as a shop with payments or audit_events cannot be. Unmarked tickets, and shops
--       whose tickets were never marked, are deleted as before;
--     * '[E2E]' synthetic shops are still purgeable, because purge_synthetic_shop() sets the
--       existing 'redlined1.purging_synthetic_shop' flag that the trigger recognises.
--   To remove a REAL marked ticket or shop deliberately, an owner-level procedure must first
--   export the history (see Rollback, step 3); that decision is intentionally not automatic.
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

-- Supabase hands every new public table (and its sequences) to anon, authenticated AND service_role with
-- ALL privileges by default. Granting SELECT, INSERT afterwards would only ADD to that, never remove it, so
-- service_role would keep UPDATE, DELETE and TRUNCATE and the table would not be append-only. Take every
-- default back from every API role, then grant exactly what is needed.
REVOKE ALL ON public.support_ticket_triage_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.support_ticket_triage_events TO service_role;

-- The identity sequence gets the same default grants. setval() on it would let a caller break "newest row =
-- highest id". Inserting into an identity column needs no privilege on its sequence.
DO $$
BEGIN
  EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated, service_role',
                 pg_get_serial_sequence('public.support_ticket_triage_events', 'id'));
END $$;

-- Append-only for everyone, not only for the API roles (grants alone do not bind the table owner or a
-- foreign-key cascade). Mirrors payments_are_append_only(): the single exemption is a purge of a synthetic
-- '[E2E]' shop, which sets this transaction-local flag inside purge_synthetic_shop().
CREATE OR REPLACE FUNCTION public.support_ticket_triage_events_are_append_only()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF current_setting('redlined1.purging_synthetic_shop', true) = 'on' THEN
    IF TG_LEVEL = 'ROW' THEN RETURN OLD; END IF;
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'support_ticket_triage_events is append-only (attempted %): a ticket or shop with marker history cannot be deleted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $fn$;

DROP TRIGGER IF EXISTS support_ticket_triage_events_no_update ON public.support_ticket_triage_events;
CREATE TRIGGER support_ticket_triage_events_no_update
  BEFORE UPDATE OR DELETE ON public.support_ticket_triage_events
  FOR EACH ROW EXECUTE FUNCTION public.support_ticket_triage_events_are_append_only();

DROP TRIGGER IF EXISTS support_ticket_triage_events_no_truncate ON public.support_ticket_triage_events;
CREATE TRIGGER support_ticket_triage_events_no_truncate
  BEFORE TRUNCATE ON public.support_ticket_triage_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.support_ticket_triage_events_are_append_only();

-- RLS with no policy is only a guarantee if RLS is actually on and the grants are gone. Asserted, not assumed,
-- against EVERY privilege type, so a default this file did not anticipate aborts the transaction instead of shipping.
DO $$
DECLARE
  t   CONSTANT text := 'public.support_ticket_triage_events';
  seq text := pg_get_serial_sequence('public.support_ticket_triage_events', 'id');
  r   text;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = t::regclass) THEN
    RAISE EXCEPTION 'RLS did not enable on support_ticket_triage_events';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = t::regclass AND NOT tgisinternal
        AND tgname IN ('support_ticket_triage_events_no_update', 'support_ticket_triage_events_no_truncate')) <> 2 THEN
    RAISE EXCEPTION 'the append-only triggers on support_ticket_triage_events are missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = t::regclass) THEN
    RAISE EXCEPTION 'support_ticket_triage_events must have no policies';
  END IF;
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(r, t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_sequence_privilege(r, seq, 'USAGE,SELECT,UPDATE') THEN
      RAISE EXCEPTION '% still holds a privilege on support_ticket_triage_events', r;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role', t, 'SELECT') OR NOT has_table_privilege('service_role', t, 'INSERT') THEN
    RAISE EXCEPTION 'service_role must be able to SELECT and INSERT support_ticket_triage_events';
  END IF;
  IF has_table_privilege('service_role', t, 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_sequence_privilege('service_role', seq, 'USAGE,SELECT,UPDATE') THEN
    RAISE EXCEPTION 'service_role holds more than SELECT and INSERT: the table would not be append-only';
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
--   Who can touch it (expect only service_role, SELECT and INSERT, apart from the owner):
--     SELECT grantee, privilege_type FROM information_schema.role_table_grants
--     WHERE table_schema = 'public' AND table_name = 'support_ticket_triage_events' AND grantee <> 'postgres';
--
--   support_tickets is unchanged: its policies are exactly those in 2026-08-03_support_tickets.sql.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   Nothing outside this table was changed. This table is an AUDIT TRAIL: once it holds a marking it is
--   never dropped as part of a rollback.
--
--   1. Rolling back the APPLICATION needs no database change. The previous build never reads or writes this
--      table, and the current build treats a missing table as "every ticket unreviewed". Leave it in place.
--
--   2. Removing the table is only for the case where it is still EMPTY (for example the migration was applied
--      and then abandoned before any marking). The guard aborts, dropping nothing, if any row exists:
--
--        BEGIN;
--        DO $$ BEGIN
--          IF EXISTS (SELECT 1 FROM public.support_ticket_triage_events) THEN
--            RAISE EXCEPTION 'support_ticket_triage_events holds audit rows: keep or archive it, do not drop it';
--          END IF;
--        END $$;
--        DROP TABLE public.support_ticket_triage_events;
--        COMMIT;
--
--   3. If markings exist and the feature must be switched off, keep the data. Export it first, then (only if the
--      name must be freed) rename it. Its lock-down (RLS on, no policy, service_role SELECT+INSERT) is kept, and the
--      application then behaves as if the table were absent:
--
--        SELECT id, ticket_id, triage, set_by, created_at FROM public.support_ticket_triage_events ORDER BY id;   -- save this output
--        ALTER TABLE public.support_ticket_triage_events RENAME TO support_ticket_triage_events_archive;
--        ALTER INDEX public.support_ticket_triage_events_ticket_idx RENAME TO support_ticket_triage_events_archive_ticket_idx;
--
--      (Rename the index too: a later re-apply of this file would otherwise skip CREATE INDEX IF NOT EXISTS because
--      the old name is taken, leaving the new table without it.)
--
--   The append-only trigger does not fire on DROP TABLE or RENAME, so the steps above work as written. It DOES refuse
--   any DELETE of marker rows, including the one a ticket or shop deletion would cascade into; nothing in a rollback
--   should try that.
