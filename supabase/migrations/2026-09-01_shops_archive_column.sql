-- Give shops an archive state.
--
-- RUN AGAINST redlined1 BEFORE deploying the application change.
--
-- Additive and invisible: two nullable columns. Code that does not know about
-- them is unaffected, which is why this half runs first — the app cannot
-- filter on a column that does not exist yet. Same shape as the customer
-- archive in 2026-08-17_m3a_customer_archive_column.sql.
--
-- ---------------------------------------------------------------------------
-- Why archiving rather than deleting
-- ---------------------------------------------------------------------------
--
-- The tenant list holds twelve shops. Three are internal experiments and one
-- is an automated test fixture, and the only way to remove any of them today
-- is DELETE. That works for the empty ones and does not work for the fixture:
-- it carries 52 audit_events, and audit_events refuses deletion at the
-- database level — `42501 permission denied`, even to service_role. Deleting
-- its shop row would either fail on the foreign key or null those rows'
-- shop_id, which mutates a trail that is deliberately immutable.
--
-- The same problem arrives with real customers. A shop that stops paying has
-- invoices, payments and an audit trail that must not evaporate, and it still
-- needs to leave the operator's list. Deletion cannot express that; archiving
-- can.
--
-- ---------------------------------------------------------------------------
-- Deliberately no index
-- ---------------------------------------------------------------------------
--
-- The customer archive added a partial index because every customer list
-- filters on it across 76 rows and growing. `shops` holds twelve, and the only
-- query is "the shops this user belongs to" — already bounded by a handful of
-- ids. An index here would be copied ceremony with a real write cost and no
-- read benefit. Add one when the table is large enough to need it.

BEGIN;

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;

COMMENT ON COLUMN public.shops.archived_at IS
  'Set when the shop is archived; null means active. Archived shops are hidden '
  'from the shop picker, EXCEPT when a user has no unarchived shop — archiving '
  'someone''s only shop must not lock them out of the app.';

COMMIT;


-- ── Verification ────────────────────────────────────────────────────────────
--
--   SELECT count(*) AS total,
--          count(*) FILTER (WHERE archived_at IS NULL) AS active
--   FROM public.shops;
--
--   Expect total = active = 12: nothing is archived by this migration.

SELECT count(*) AS total,
       count(*) FILTER (WHERE archived_at IS NULL) AS active
FROM public.shops;


-- ── Archiving the test fixture, once the app change is deployed ─────────────
--
-- Not run here, because a shop hidden by a column the deployed code does not
-- read yet would simply be invisible for no reason.
--
--   UPDATE public.shops
--   SET archived_at = now(),
--       archived_reason = 'Automated end-to-end test fixture, not a customer'
--   WHERE id = 'e95c140f-7954-41c4-8fff-17ef50408045';   -- E2E Audit Shop


-- ── Rollback ────────────────────────────────────────────────────────────────
--   ALTER TABLE public.shops
--     DROP COLUMN IF EXISTS archived_reason,
--     DROP COLUMN IF EXISTS archived_at;
--
--   Archived shops reappear in the picker. Nothing is lost.
