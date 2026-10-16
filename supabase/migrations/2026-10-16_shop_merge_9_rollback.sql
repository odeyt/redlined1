-- ============================================================================
-- Shop merge — ROLLBACK of 2026-10-16_shop_merge_1_apply.sql.
--
-- Puts D1 Imports back in the location picker and removes exactly the
-- memberships the merge inserted (from public.shop_merge_ledger). Memberships
-- that existed before the merge are not touched. No business data is touched:
-- the merge moved none.
--
-- Run the whole file in the Supabase SQL editor as one execution. Safe to
-- rerun: the second run finds nothing left to undo.
--
-- Records created at Location 2 after the merge stay at Location 2. Users whose
-- active shop is Location 2 stay there; the switcher reappears for anyone who
-- still belongs to both shops.
-- ============================================================================

BEGIN;

-- 1. Un-archive D1 Imports — only if this merge archived it.
UPDATE public.shops
SET archived_at = NULL,
    archived_reason = NULL
WHERE id = '38d55fae-741b-4bac-b520-f96eed65bf38'
  AND archived_reason LIKE 'Location closed 2026-10; merged into D1 Imports — Location 2%';

-- 2. Remove the memberships the merge inserted, and mark them undone.
WITH removed AS (
  DELETE FROM public.shop_users su
  USING public.shop_merge_ledger l
  WHERE l.merge_key = 'd1-location-merge-2026-10'
    AND l.rolled_back_at IS NULL
    AND su.shop_id = l.shop_id
    AND su.user_id = l.user_id
  RETURNING su.shop_id, su.user_id
)
UPDATE public.shop_merge_ledger l
SET rolled_back_at = now()
WHERE l.merge_key = 'd1-location-merge-2026-10'
  AND l.rolled_back_at IS NULL;

COMMIT;

-- The ledger table is kept (rows are marked rolled_back_at) as the record of
-- what happened. It is RLS-locked and holds no business data.


-- ── VERIFY — read-only, run each on its own ────────────────────────────────

-- R1. Expect both shops 'active'.
SELECT name, coalesce(archived_at::text, 'active') AS state
FROM public.shops
WHERE id IN ('38d55fae-741b-4bac-b520-f96eed65bf38', '90b72748-bf01-4456-999f-f4ba48091606');

-- R2. Expect ZERO rows: no merge-inserted membership survives.
SELECT su.shop_id, su.user_id
FROM public.shop_users su
JOIN public.shop_merge_ledger l
  ON l.shop_id = su.shop_id AND l.user_id = su.user_id
WHERE l.merge_key = 'd1-location-merge-2026-10';

-- R3. Membership per user, to compare with STEP 0's Q2.
SELECT u.email,
       max(su.role) FILTER (WHERE su.shop_id = '38d55fae-741b-4bac-b520-f96eed65bf38') AS shop1_role,
       max(su.role) FILTER (WHERE su.shop_id = '90b72748-bf01-4456-999f-f4ba48091606') AS shop2_role
FROM public.shop_users su
JOIN auth.users u ON u.id = su.user_id
WHERE su.shop_id IN ('38d55fae-741b-4bac-b520-f96eed65bf38', '90b72748-bf01-4456-999f-f4ba48091606')
GROUP BY u.email
ORDER BY u.email;
