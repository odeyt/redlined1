-- ============================================================================
-- Shop merge — EMERGENCY ROLLBACK of 2026-10-16_shop_merge.sql.
--
-- NOT A ROLLOUT STEP. Use only if the merge has to be undone, after stopping
-- further writes and collecting evidence. Never run it to "test" production.
--
-- It undoes only what public.shop_merge_ledger proves the merge did, and only
-- where the row is STILL EXACTLY what the merge left:
--
--   membership  the shop_users row the merge inserted. Removed only if its
--               xmin and full snapshot still match the ledger. A row that was
--               changed since (role edit, re-invite, even a no-op UPDATE) or
--               deleted and recreated has a different xmin and is a CONFLICT.
--   archive     D1 Imports' archived_at / archived_reason. Cleared only if both
--               still equal what the merge set.
--
-- Rows the ledger does not hold — memberships that existed before the merge,
-- memberships added after it, an archive that predated it — are never touched.
--
-- ON ANY CONFLICT THE WHOLE ROLLBACK ABORTS AND CHANGES NOTHING. The error
-- lists each conflicting row and its ledger id. Resolve each one deliberately,
-- then rerun this file:
--
--   * Keep the current row as it is (the usual choice — someone changed it on
--     purpose):
--       UPDATE public.shop_merge_ledger
--          SET status = 'kept_by_owner', resolved_at = now()
--        WHERE id = <ledger id> AND status = 'applied';
--     The row stays; the ledger records that it was kept, not undone.
--
--   * Or remove it yourself after checking it, then rerun; a row that is gone
--     is recorded as 'absent_at_rollback'.
--
-- A ledger entry whose row is already gone is recorded as 'absent_at_rollback',
-- never as 'rolled_back'.
--
-- Safe to rerun: a second run finds nothing left in status 'applied'.
-- Records created at Location 2 after the merge stay at Location 2.
-- ============================================================================

BEGIN;

-- Snapshots include timestamps, whose jsonb text depends on the session time
-- zone. Pinning it makes the merge and its rollback compare like with like.
SET LOCAL TimeZone = 'UTC';

-- ── Unlock. Leave commented and the file refuses to run. Uncomment ONLY when
-- the owner has decided to roll back. A tool that applies every file in
-- supabase/migrations therefore can never run this by accident.
-- SELECT set_config('shop_merge.rollback', 'd1-location-merge-2026-10', true);

DO $$
BEGIN
  IF coalesce(current_setting('shop_merge.rollback', true), '') <> 'd1-location-merge-2026-10' THEN
    RAISE EXCEPTION 'Shop merge rollback is locked. It is emergency recovery only: '
                    'uncomment the set_config line at the top of this file to run it.';
  END IF;
  IF to_regclass('public.shop_merge_ledger') IS NULL THEN
    RAISE EXCEPTION 'public.shop_merge_ledger does not exist — the merge was never applied here. Nothing to undo.';
  END IF;
END $$;

-- Stable view of memberships and the D1 Imports row while this decides.
LOCK TABLE public.shop_users IN SHARE ROW EXCLUSIVE MODE;
SELECT 1 FROM public.shops WHERE id = '38d55fae-741b-4bac-b520-f96eed65bf38' FOR UPDATE;

-- ── Classify every live ledger entry ───────────────────────────────────────
CREATE TEMP TABLE shop_merge_rollback_plan ON COMMIT DROP AS
SELECT l.id, l.kind, l.shop_id, l.user_id,
       l.row_snapshot ->> 'role' AS ledger_role,
       su.role                   AS now_role,
       CASE l.kind
         WHEN 'membership' THEN
           CASE
             WHEN su.user_id IS NULL                              THEN 'absent'
             WHEN su.xmin::text = l.row_xmin
              AND to_jsonb(su.*) = l.row_snapshot                 THEN 'unchanged'
             ELSE                                                      'changed'
           END
         WHEN 'archive' THEN
           CASE
             WHEN s.id IS NULL OR s.archived_at IS NULL           THEN 'absent'
             WHEN jsonb_build_object('archived_at', s.archived_at, 'archived_reason', s.archived_reason)
                  = l.row_snapshot                                THEN 'unchanged'
             ELSE                                                      'changed'
           END
       END AS state
FROM public.shop_merge_ledger l
LEFT JOIN public.shop_users su
  ON l.kind = 'membership' AND su.shop_id = l.shop_id AND su.user_id = l.user_id
LEFT JOIN public.shops s
  ON l.kind = 'archive' AND s.id = l.shop_id
WHERE l.merge_key = 'd1-location-merge-2026-10'
  AND l.status = 'applied';

-- ── Abort on any conflict, with an actionable report ───────────────────────
DO $$
DECLARE
  report TEXT;
BEGIN
  SELECT string_agg(format('ledger id %s: %s shop %s user %s (merge set role %s, now %s)',
                           p.id, p.kind, p.shop_id, coalesce(p.user_id::text, '-'),
                           coalesce(p.ledger_role, '-'), coalesce(p.now_role, '-')),
                    E'\n' ORDER BY p.id)
    INTO report
  FROM shop_merge_rollback_plan p
  WHERE p.state = 'changed';

  IF report IS NOT NULL THEN
    RAISE EXCEPTION E'Shop merge rollback aborted: these rows changed after the merge and were NOT touched. Nothing was changed.\n%', report
      USING HINT = 'For each row, keep it (UPDATE public.shop_merge_ledger SET status = ''kept_by_owner'', resolved_at = now() WHERE id = <ledger id> AND status = ''applied'') or resolve it by hand, then rerun this file.';
  END IF;
END $$;

-- ── Undo exactly the unchanged rows ────────────────────────────────────────
DELETE FROM public.shop_users su
USING shop_merge_rollback_plan p, public.shop_merge_ledger l
WHERE p.kind = 'membership' AND p.state = 'unchanged'
  AND l.id = p.id
  AND su.shop_id = p.shop_id AND su.user_id = p.user_id
  AND su.xmin::text = l.row_xmin;           -- re-checked at the moment of deletion

UPDATE public.shops s
SET archived_at = NULL,
    archived_reason = NULL
FROM shop_merge_rollback_plan p, public.shop_merge_ledger l
WHERE p.kind = 'archive' AND p.state = 'unchanged'
  AND l.id = p.id
  AND s.id = p.shop_id
  AND jsonb_build_object('archived_at', s.archived_at, 'archived_reason', s.archived_reason) = l.row_snapshot;

UPDATE public.shop_merge_ledger l
SET status = CASE p.state WHEN 'unchanged' THEN 'rolled_back' ELSE 'absent_at_rollback' END,
    resolved_at = now()
FROM shop_merge_rollback_plan p
WHERE l.id = p.id;

COMMIT;

-- The ledger table is kept as the record of what happened. It is RLS-locked
-- and holds no business data.


-- ── VERIFY — read-only, run each on its own ────────────────────────────────

-- R1. Expect both shops 'active' (unless D1 Imports was archived before the merge).
SELECT name, coalesce(archived_at::text, 'active') AS state
FROM public.shops
WHERE id IN ('38d55fae-741b-4bac-b520-f96eed65bf38', '90b72748-bf01-4456-999f-f4ba48091606');

-- R2. Expect no row in status 'applied'. 'kept_by_owner' rows are memberships
-- deliberately left in place; 'absent_at_rollback' were already gone.
SELECT kind, status, count(*)
FROM public.shop_merge_ledger
WHERE merge_key = 'd1-location-merge-2026-10'
GROUP BY kind, status
ORDER BY kind, status;

-- R3. Membership per user, to compare with the preflight's Q2.
SELECT u.email,
       max(su.role) FILTER (WHERE su.shop_id = '38d55fae-741b-4bac-b520-f96eed65bf38') AS shop1_role,
       max(su.role) FILTER (WHERE su.shop_id = '90b72748-bf01-4456-999f-f4ba48091606') AS shop2_role
FROM public.shop_users su
JOIN auth.users u ON u.id = su.user_id
WHERE su.shop_id IN ('38d55fae-741b-4bac-b520-f96eed65bf38', '90b72748-bf01-4456-999f-f4ba48091606')
GROUP BY u.email
ORDER BY u.email;
