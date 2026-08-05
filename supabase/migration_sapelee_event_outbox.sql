-- ─────────────────────────────────────────────────────────────────────────────
-- PROPOSAL ONLY — NOT APPLIED. Phase E Part 1 (Sapelee Event Bus integration),
-- Parts 6-7. Per the mission's explicit safety section: "No production
-- database changes." This file exists for review; it is not run against any
-- database by this work. Follows this repo's own migration_*.sql naming and
-- RLS conventions (see migration_observability_logs.sql) rather than
-- inventing a new format.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. sapelee_event_outbox table ──────────────────────────────────────────
--
-- The offline queue (Part 7): every real business event that should reach
-- Sapelee is written here FIRST, from the same client-side call site that
-- already writes the underlying business row (job_cards, invoices, etc.) —
-- never sent directly over HTTP from the browser, since that would require
-- the HMAC signing secret to be present in client code, which must never
-- happen. A separate server-side flush process (lib/sapelee/flush.ts) reads
-- this table, signs each row, and delivers it to Sapelee's POST /api/events.

CREATE TABLE IF NOT EXISTS public.sapelee_event_outbox (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id          uuid,
  event_type       text        NOT NULL,
  event_version    integer     NOT NULL DEFAULT 1,
  payload          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  aggregate_type   text,
  aggregate_id     text,
  idempotency_key  text,
  correlation_id   text,
  status           text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts         integer     NOT NULL DEFAULT 0,
  max_attempts     integer     NOT NULL DEFAULT 8,
  last_error       text,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  delivered_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Idempotency at the outbox layer itself: a caller-supplied idempotency_key
-- can only appear once per row, so a double-fired client call (e.g. a retry
-- after a network blip on the INSERT's own response) can't double-enqueue.
CREATE UNIQUE INDEX IF NOT EXISTS sapelee_outbox_idempotency_key_unique
  ON public.sapelee_event_outbox (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- The flush process's hot-path query: oldest pending row whose retry
-- backoff has elapsed, in creation order (ordering guarantee, Part 7).
CREATE INDEX IF NOT EXISTS sapelee_outbox_pending_idx
  ON public.sapelee_event_outbox (created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS sapelee_outbox_shop_idx
  ON public.sapelee_event_outbox (shop_id) WHERE shop_id IS NOT NULL;

-- ── 2. Row Level Security ───────────────────────────────────────────────────

ALTER TABLE public.sapelee_event_outbox ENABLE ROW LEVEL SECURITY;

-- Shop members can enqueue events for their own shop (the actual call sites
-- run client-side, under the requesting user's own session) — mirrors
-- migration_multitenant.sql's my_shop_ids() pattern used across this repo.
DROP POLICY IF EXISTS "sapelee_outbox_shop_insert" ON public.sapelee_event_outbox;
CREATE POLICY "sapelee_outbox_shop_insert"
  ON public.sapelee_event_outbox FOR INSERT
  WITH CHECK (
    shop_id IS NOT NULL
    AND shop_id = ANY (public.my_shop_ids())
  );

-- Reading/updating/deleting the outbox is an internal delivery-mechanism
-- concern, not a shop-user-facing feature — restricted to the service role
-- (the flush route/script), same pattern as migration_observability_logs.sql's
-- service-role write policy, mirrored here for read/update instead.
DROP POLICY IF EXISTS "sapelee_outbox_service_manage" ON public.sapelee_event_outbox;
CREATE POLICY "sapelee_outbox_service_manage"
  ON public.sapelee_event_outbox FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 3. Validation — run after applying ──────────────────────────────────────
--   SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'public.sapelee_event_outbox'::regclass;
--   SELECT indexname FROM pg_indexes WHERE tablename = 'sapelee_event_outbox';

-- ── 4. Rollback ──────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS public.sapelee_event_outbox;
-- Safe immediately after applying (new, empty table). Once real queued
-- events exist, flush or explicitly discard them first — dropping the table
-- with pending rows silently loses those events rather than delivering or
-- reporting them as failed.
