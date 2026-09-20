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

-- ─── STEP 2 · CREATE (only after step 1 returns zero rows) ──────────────────────────────────────────────────
-- CONCURRENTLY cannot run inside a transaction block. Run it on its own.
--
--   CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS billing_events_provider_event_uniq
--     ON public.billing_events (provider, provider_event_id)
--     WHERE provider_event_id IS NOT NULL AND provider_event_id <> '';

-- ─── ROLLBACK ───────────────────────────────────────────────────────────────────────────────────────────────
--   DROP INDEX CONCURRENTLY IF EXISTS billing_events_provider_event_uniq;
--
-- The handler already copes with the constraint in place: a losing insert returns 23505 and is treated as a
-- duplicate, so the index can be created and dropped without a code change either way.
