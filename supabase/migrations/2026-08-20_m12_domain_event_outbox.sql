-- M12 — Domain event outbox and relay
--
-- The M0 audit found four event mechanisms already in this codebase and said
-- the instinct would be to build a fifth. This is not a fifth: it is the
-- transactional queue the Redline Intelligence Bus needs in order to stop
-- being dormant, modelled directly on sapelee_event_outbox, which has been
-- delivering in production for months.
--
-- ## Two rules from the audit
--
--   1. Domain events are emitted by the SERVICE layer, not by triggers. A
--      trigger cannot know the actor's intent, cannot be tested without a
--      database, and — proven twice here — a bug in one blocks the business
--      operation itself.
--
--   2. External delivery never happens inside the transaction. Write to the
--      outbox, deliver after commit, dedupe on idempotency_key.
--
-- ## What this fixes that the existing outbox does not
--
-- sapelee-flush.yml says it plainly: "flush.ts has no atomic claim step, so
-- concurrent runs could double-deliver". It works around that with a GitHub
-- Actions concurrency group — which holds only as long as every caller is that
-- one workflow. This outbox has a real claim: FOR UPDATE SKIP LOCKED inside a
-- function, so two relays running at once each take different rows.
--
-- ## What this does NOT give you
--
-- Atomicity between the business write and the event write. The domain layer
-- talks to PostgREST, which has no client-side transactions: the event is
-- inserted immediately after the row it describes, not with it. A process that
-- dies between the two loses the event.
--
-- That is a real gap and it is stated rather than papered over. Closing it
-- means moving those writes into database functions, which is a larger change
-- than this one and should be done deliberately, per entity, when something
-- actually depends on the guarantee.
--
-- ## RUN THIS IN SECTIONS
--
-- Three sections with line counts, each ending in its own check.

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — the outbox        (about 70 lines)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.domain_event_outbox (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID REFERENCES public.organizations(id) ON DELETE RESTRICT,
  shop_id          UUID REFERENCES public.shops(id) ON DELETE RESTRICT,

  event_type       TEXT NOT NULL,
  event_version    INTEGER NOT NULL DEFAULT 1,
  payload          JSONB NOT NULL DEFAULT '{}'::jsonb,

  aggregate_type   TEXT,
  aggregate_id     TEXT,

  -- Who caused it. An event with no actor cannot answer the question people
  -- actually ask of an event log, which is "who did this".
  actor_user_id    UUID,
  actor_type       TEXT NOT NULL DEFAULT 'user',

  idempotency_key  TEXT,
  correlation_id   TEXT,

  status           TEXT NOT NULL DEFAULT 'pending',
  attempts         INTEGER NOT NULL DEFAULT 0,
  max_attempts     INTEGER NOT NULL DEFAULT 8,
  last_error       TEXT,
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Set while a relay holds this row. A crashed relay leaves it set, so the
  -- claim function treats anything claimed longer than five minutes ago as
  -- abandoned and takes it back.
  claimed_at       TIMESTAMPTZ,
  claimed_by       TEXT,

  delivered_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT outbox_status_check
    CHECK (status IN ('pending', 'delivered', 'failed', 'dead')),
  CONSTRAINT outbox_actor_type_check
    CHECK (actor_type IN ('user', 'system', 'api', 'mcp', 'ai', 'webhook'))
);

-- Idempotency at the outbox itself: the same key twice is the same event, so
-- a retried domain call cannot enqueue a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS outbox_idempotency_key_unique
  ON public.domain_event_outbox (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- The relay's query: pending, due, not already claimed. Partial, because the
-- delivered rows will outnumber the pending ones by orders of magnitude within
-- weeks and there is no reason to index them.
CREATE INDEX IF NOT EXISTS outbox_pending_idx
  ON public.domain_event_outbox (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS outbox_aggregate_idx
  ON public.domain_event_outbox (aggregate_type, aggregate_id, created_at DESC);

DROP TRIGGER IF EXISTS domain_event_outbox_touch ON public.domain_event_outbox;
CREATE TRIGGER domain_event_outbox_touch
  BEFORE UPDATE ON public.domain_event_outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;

-- ── Check section 1 ─────────────────────────────────────────────────────────
SELECT 'outbox table (expect 1)' AS check_name, count(*)::text AS result
  FROM pg_tables WHERE schemaname = 'public' AND tablename = 'domain_event_outbox'
UNION ALL
SELECT 'idempotency index (expect 1)', count(*)::text
  FROM pg_indexes WHERE indexname = 'outbox_idempotency_key_unique';

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — the atomic claim        (about 95 lines)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The piece the existing outbox does not have.
--
-- FOR UPDATE SKIP LOCKED is what makes two relays safe: each transaction locks
-- the rows it takes and skips any already locked, so they divide the work
-- instead of fighting over it. Without it, both read the same pending rows and
-- both deliver them.
--
-- The five-minute reclaim exists because a relay can die mid-delivery. Without
-- it a crash strands its rows as claimed forever, and the queue quietly stops
-- draining with nothing reporting an error.

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_domain_events(p_limit INT DEFAULT 50, p_worker TEXT DEFAULT NULL)
RETURNS SETOF public.domain_event_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT o.id
    FROM public.domain_event_outbox o
    WHERE o.status = 'pending'
      AND o.next_attempt_at <= now()
      AND (o.claimed_at IS NULL OR o.claimed_at < now() - interval '5 minutes')
    ORDER BY o.next_attempt_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.domain_event_outbox o
     SET claimed_at = now(),
         claimed_by = COALESCE(p_worker, 'relay')
   WHERE o.id IN (SELECT id FROM claimed)
  RETURNING o.*;
END $fn$;

REVOKE ALL ON FUNCTION public.claim_domain_events(INT, TEXT) FROM PUBLIC;
-- service_role only. A relay runs as trusted server code; a browser has no
-- business claiming events, and granting this to authenticated would let any
-- signed-in user drain the queue.
GRANT EXECUTE ON FUNCTION public.claim_domain_events(INT, TEXT) TO service_role;

-- Record the outcome of one delivery attempt.
--
-- Backoff is exponential and capped: 1, 2, 4, 8… minutes up to an hour. A
-- fixed retry hammers a broken endpoint; an uncapped one means a transient
-- failure at attempt 8 waits four hours.
CREATE OR REPLACE FUNCTION public.settle_domain_event(
  p_id UUID,
  p_ok BOOLEAN,
  p_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_attempts INT;
  v_max      INT;
  v_delay    INTERVAL;
BEGIN
  IF p_ok THEN
    UPDATE public.domain_event_outbox
       SET status = 'delivered',
           delivered_at = now(),
           claimed_at = NULL,
           claimed_by = NULL,
           last_error = NULL
     WHERE id = p_id;
    RETURN;
  END IF;

  SELECT attempts + 1, max_attempts INTO v_attempts, v_max
  FROM public.domain_event_outbox WHERE id = p_id;

  IF v_attempts IS NULL THEN
    RETURN;   -- row vanished; nothing to settle
  END IF;

  v_delay := least(power(2, v_attempts) * interval '1 minute', interval '1 hour');

  UPDATE public.domain_event_outbox
     SET attempts = v_attempts,
         last_error = left(COALESCE(p_error, 'unknown error'), 2000),
         claimed_at = NULL,
         claimed_by = NULL,
         -- 'dead' rather than 'failed': a row that has exhausted its attempts
         -- is not retried again, and a person has to look at it. Silently
         -- retrying forever is how a broken endpoint becomes invisible.
         status = CASE WHEN v_attempts >= v_max THEN 'dead' ELSE 'pending' END,
         next_attempt_at = now() + v_delay
   WHERE id = p_id;
END $fn$;

REVOKE ALL ON FUNCTION public.settle_domain_event(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_domain_event(UUID, BOOLEAN, TEXT) TO service_role;

COMMIT;

-- ── Check section 2 ─────────────────────────────────────────────────────────
SELECT 'claim function (expect 1)' AS check_name, count(*)::text AS result
  FROM pg_proc WHERE proname = 'claim_domain_events'
UNION ALL
SELECT 'settle function (expect 1)', count(*)::text
  FROM pg_proc WHERE proname = 'settle_domain_event'
UNION ALL
SELECT 'claim uses SKIP LOCKED (expect true)',
       (prosrc LIKE '%SKIP LOCKED%')::text
  FROM pg_proc WHERE proname = 'claim_domain_events'
UNION ALL
SELECT 'authenticated cannot claim (expect false)',
       has_function_privilege('authenticated', 'public.claim_domain_events(int,text)', 'EXECUTE')::text;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3 — access        (about 40 lines)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The outbox is written by the application on behalf of a signed-in user, and
-- read by owners who want to see what the system has been emitting. It is
-- never updated or deleted from a browser: attempts, status and backoff belong
-- to the relay, and a person editing them by hand would either replay a
-- delivered event or bury a failing one.

BEGIN;

ALTER TABLE public.domain_event_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outbox_insert ON public.domain_event_outbox;
CREATE POLICY outbox_insert ON public.domain_event_outbox
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Only into a shop you belong to, and only ever as pending. An event that
    -- arrives already 'delivered' would never be sent.
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.shop_users su
      WHERE su.shop_id = domain_event_outbox.shop_id
        AND su.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS outbox_select ON public.domain_event_outbox;
CREATE POLICY outbox_select ON public.domain_event_outbox
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shop_users su
    WHERE su.shop_id = domain_event_outbox.shop_id
      AND su.user_id = auth.uid()
      AND public.has_capability(domain_event_outbox.shop_id, 'audit.read')
  ));

REVOKE ALL ON public.domain_event_outbox FROM PUBLIC;

-- INSERT and SELECT only. The relay runs as service_role, which is not subject
-- to these grants, so it can still update rows as it delivers them.
GRANT SELECT, INSERT ON public.domain_event_outbox TO authenticated;

COMMIT;

-- ── Check section 3 ─────────────────────────────────────────────────────────
SELECT 'policies (expect 2)' AS check_name, count(*)::text AS result
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'domain_event_outbox'
UNION ALL
SELECT 'rls on (expect true)', c.relrowsecurity::text
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'domain_event_outbox'
UNION ALL
SELECT 'browser cannot update the queue (expect false)',
       has_table_privilege('authenticated', 'public.domain_event_outbox', 'UPDATE')::text
UNION ALL
SELECT 'browser cannot delete events (expect false)',
       has_table_privilege('authenticated', 'public.domain_event_outbox', 'DELETE')::text;
