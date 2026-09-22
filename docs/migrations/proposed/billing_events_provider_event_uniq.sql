-- PROPOSED — NOT APPLIED, and deliberately not placed in supabase/migrations/.
--
-- Closes overlapping webhook deliveries inserting two rows for one provider event. This is INDEPENDENT of the
-- event-ordering decision (Options A/B/C): ordering decides which state wins, this decides that one event is
-- recorded once. Option B does not remove the need for it.
--
-- The columns match app/api/billing/webhook/creem/route.ts findEventRows(), which filters on
-- (provider, provider_event_id). Query and constraint must agree, or the index permits rows the lookup returns.
--
-- The existing non-unique idx_billing_events_provider_event_id (migration_commercial_billing.sql:100) STAYS:
-- its leading column is provider_event_id, and it is not made redundant by an index led by provider.

-- ─── STEP 1 · PREFLIGHT (read-only). Must return ZERO rows before step 2 is run. ────────────────────────────
-- Any row here is a duplicate that already exists; creating the index would fail. Resolve them first, by
-- deciding which row is authoritative — never by deleting billing history without the owner's approval.
SELECT provider,
       provider_event_id,
       count(*)                      AS duplicate_rows,
       min(created_at)               AS first_seen,
       max(created_at)               AS last_seen,
       bool_or(processed)            AS any_processed,
       count(*) FILTER (WHERE processed) AS processed_rows
FROM public.billing_events
WHERE provider_event_id IS NOT NULL
  AND provider_event_id <> ''
GROUP BY provider, provider_event_id
HAVING count(*) > 1
ORDER BY duplicate_rows DESC, last_seen DESC;

-- Context for any duplicates found: how many events are affected at all.
SELECT count(*) AS total_events,
       count(*) FILTER (WHERE provider_event_id IS NULL OR provider_event_id = '') AS events_without_id
FROM public.billing_events;

-- Preflight as run read-only on 2026-09-21 against production: 8 billing_events rows, 0 with a null or empty
-- provider_event_id, 8 distinct (provider, provider_event_id) pairs, 0 duplicates, one provider ('creem').
-- Clean at that moment. Re-run it — the answer is only as current as the last row written.

-- ─── STEP 2 · CREATE (only after step 1 returns zero rows) ──────────────────────────────────────────────────
-- CONCURRENTLY cannot run inside a transaction block. Run it on its own, not inside a BEGIN/COMMIT and not in a
-- tool that wraps statements in one.
--
--   CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS billing_events_provider_event_uniq
--     ON public.billing_events (provider, provider_event_id)
--     WHERE provider_event_id IS NOT NULL AND provider_event_id <> '';

-- ─── STEP 3 · VERIFY (NOT optional) ─────────────────────────────────────────────────────────────────────────
-- A CONCURRENTLY build that fails does NOT roll back. It leaves the index in place and marked INVALID, where it
-- occupies space, is not used by the planner, and — the part that matters here — ENFORCES NOTHING. The CREATE
-- reporting an error, or the session dropping mid-build, both end this way. So an index that exists is not
-- evidence of a constraint; only indisvalid is.
--
-- Expect exactly one row, with is_valid = true and is_unique = true.
SELECT c.relname                AS index_name,
       i.indisvalid             AS is_valid,
       i.indisunique            AS is_unique,
       i.indisready             AS is_ready,
       pg_get_expr(i.indpred, i.indrelid) AS partial_predicate,
       pg_size_pretty(pg_relation_size(c.oid)) AS index_size
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname = 'billing_events_provider_event_uniq';

-- Zero rows  -> the CREATE never ran. Nothing was changed; re-run step 2.
-- is_valid = false -> the build FAILED. The table is NOT protected. Recover with:
--     DROP INDEX CONCURRENTLY IF EXISTS billing_events_provider_event_uniq;
--   then re-run step 1 (a duplicate written during the failed build is the usual cause) and step 2.
-- is_valid = true  -> the constraint is live from this point on.

-- Then prove it behaves, rather than assuming it does. In a throwaway transaction that is ROLLED BACK, so
-- nothing is kept: the second insert must fail with 23505.
--   BEGIN;
--     INSERT INTO public.billing_events (provider, event_type, provider_event_id)
--       VALUES ('creem', 'index.verification', 'verify-duplicate-me');
--     INSERT INTO public.billing_events (provider, event_type, provider_event_id)
--       VALUES ('creem', 'index.verification', 'verify-duplicate-me');   -- expect: duplicate key value (23505)
--   ROLLBACK;

-- ─── ROLLBACK ───────────────────────────────────────────────────────────────────────────────────────────────
--   DROP INDEX CONCURRENTLY IF EXISTS billing_events_provider_event_uniq;
--
-- The handler already copes with the constraint in place: a losing insert returns 23505 and is treated as a
-- duplicate, so the index can be created and dropped without a code change either way.
--
-- NOTE on the partial predicate: `IS NOT NULL` is an optimisation, since NULLs are already distinct to a unique
-- index. `<> ''` is load-bearing — empty strings are equal to one another and WOULD collide. Do not simplify it.
--
-- NOTE on the existing index: idx_billing_events_provider_event_id (non-unique, on provider_event_id alone,
-- migration_commercial_billing.sql:100) is NOT made redundant by this one, whose leading column is provider.
-- Keep it.
