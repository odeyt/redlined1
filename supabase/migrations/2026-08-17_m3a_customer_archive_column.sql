-- M3a — give customers an archive state.
--
-- RUN AGAINST redlined1 BEFORE deploying the M3 application change.
--
-- Additive and invisible: one nullable column. Code that does not know about
-- it is unaffected, which is why this half runs first — the app cannot filter
-- on a column that does not exist yet.
--
-- Why archiving at all: M2 made deleting a customer with payments impossible,
-- and M3b does the same for estimates, inspections, invoices, maintenance
-- schedules and repair orders. After that, a customer with any history cannot
-- be deleted — and staff have been using Delete as their only way to tidy a
-- list of 76 customers that includes test entries and duplicates. Taking that
-- away without replacing it would be a worse product, and the pressure would
-- come back as someone asking for the constraints to be dropped.
--
-- Archiving is what was actually wanted. Deletion was standing in for it.

BEGIN;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;

-- Every list filters on this, so it is worth an index even at 76 rows — the
-- partial form keeps it small, since the common query is "not archived".
CREATE INDEX IF NOT EXISTS customers_active_idx
  ON public.customers (shop_id)
  WHERE archived_at IS NULL;

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
--
--   SELECT count(*) AS total,
--          count(*) FILTER (WHERE archived_at IS NULL) AS active
--   FROM public.customers;
--
--   Expect total = active: nothing is archived by this migration.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   DROP INDEX IF EXISTS public.customers_active_idx;
--   ALTER TABLE public.customers
--     DROP COLUMN IF EXISTS archived_reason,
--     DROP COLUMN IF EXISTS archived_at;
--
--   Archived customers would reappear in every list. Nothing is lost.
