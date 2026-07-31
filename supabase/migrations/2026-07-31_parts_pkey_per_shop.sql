-- ============================================================================
-- Make part numbers unique PER SHOP instead of globally
--
-- NOT YET APPLIED — review before running. This alters a primary key on a live
-- table and is the one change tonight that is not trivially reversible.
--
-- FINDING: public.parts has its primary key on part_number ALONE. A part number
-- must therefore be unique across every shop in the database, so:
--
--   * D1 cannot stock the same SKU in both locations. Adding "Shell DOT 3" to
--     Location 1 fails because Location 2 already has it — the reported error
--     "duplicate key value violates unique constraint parts_pkey".
--   * Worse for a multi-tenant product: one customer's part number blocks that
--     part number for every other customer, forever. Two unrelated shops can
--     never both stock 46540-0K010.
--
-- FIX: key on (shop_id, part_number). Each shop then owns its own numbering,
-- which is how the rest of the schema already treats tenancy.
--
-- PRE-FLIGHT (verified 2026-07-31 against production):
--   * 175 parts total — 167 in Location 2, 8 in Location 1
--   * 0 rows with NULL/empty shop_id      (required: PK columns are NOT NULL)
--   * 0 rows with NULL/empty part_number
--   * 0 part numbers currently duplicated across shops, so no row is lost and
--     the new key cannot collide on creation
--
-- APPLICATION IMPACT: services/partsService.ts identifies parts by part_number
-- and passes the row's shop_id on update (updatePart), so it already addresses
-- the pair. No code change is required by this migration.
--
-- Take a backup first (Database > Backups) — this rewrites a constraint on a
-- table holding live inventory.
-- ============================================================================

BEGIN;

-- Re-check inside the transaction: abort rather than half-apply if the data
-- shifted between review and execution.
DO $$
DECLARE
  bad_rows   int;
  cross_dupes int;
BEGIN
  SELECT count(*) INTO bad_rows
  FROM public.parts
  WHERE shop_id IS NULL OR part_number IS NULL OR btrim(part_number) = '';
  IF bad_rows > 0 THEN
    RAISE EXCEPTION 'Aborting: % row(s) have a null/blank shop_id or part_number', bad_rows;
  END IF;

  SELECT count(*) INTO cross_dupes FROM (
    SELECT shop_id, part_number FROM public.parts
    GROUP BY shop_id, part_number HAVING count(*) > 1
  ) d;
  IF cross_dupes > 0 THEN
    RAISE EXCEPTION 'Aborting: % duplicate (shop_id, part_number) pair(s) exist', cross_dupes;
  END IF;
END $$;

ALTER TABLE public.parts DROP CONSTRAINT parts_pkey;
ALTER TABLE public.parts ADD CONSTRAINT parts_pkey PRIMARY KEY (shop_id, part_number);

COMMIT;


-- ── Verification ────────────────────────────────────────────────────────────

-- Expect: parts_pkey over exactly (shop_id, part_number).
SELECT c.conname,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conrelid = 'public.parts'::regclass AND c.contype = 'p';

-- Expect 175 — no rows lost.
SELECT count(*) AS total_parts FROM public.parts;

-- Expect 167 / 8 split, unchanged.
SELECT shop_id, count(*) FROM public.parts GROUP BY shop_id ORDER BY count DESC;


-- ── Rollback, if needed ─────────────────────────────────────────────────────
-- Only works while no part number is duplicated across shops. Once a shop adds
-- a number another shop already uses, reverting requires removing that row.
--
--   ALTER TABLE public.parts DROP CONSTRAINT parts_pkey;
--   ALTER TABLE public.parts ADD CONSTRAINT parts_pkey PRIMARY KEY (part_number);
