-- ============================================================================
-- Shop merge: fold D1 Imports (closed) into D1 Imports — Location 2.
--
--   Shop 1  D1 Imports              38d55fae-741b-4bac-b520-f96eed65bf38  (closed)
--   Shop 2  D1 Imports — Location 2 90b72748-bf01-4456-999f-f4ba48091606  (keeps)
--
-- Rollout, in order:
--   1. Run 2026-10-16_shop_merge_preflight.sql (read-only) and keep its results.
--   2. Merge and deploy PR #90 (the application change).
--   3. Run THIS file once, as one execution, in the Supabase SQL editor.
--   4. Run the VERIFY queries at the bottom one at a time.
--
-- 2026-10-16_shop_merge_rollback.sql is EMERGENCY RECOVERY ONLY. It is not a
-- rollout step, and it refuses to run unless deliberately unlocked.
--
-- ---------------------------------------------------------------------------
-- What this does — and does not — do
-- ---------------------------------------------------------------------------
--
-- NO BUSINESS ROW MOVES. Every job card, estimate, RO, invoice, payment,
-- customer and vehicle keeps shop_id = Shop 1. Location 2 already reads them
-- through the shop_mirrors link (Shop 2 -> Shop 1) and edits them through
-- services that scope updates with getShopIds(). New records go to Location 2.
--
-- Two writes, in one transaction:
--
--   1. MEMBERSHIP. Every member of either shop becomes a member of the other,
--      with the role they already hold. Required, not tidying:
--        - RLS shows a row only to members of its shop, and the mirror policy
--          (and lib/shops/mirrorScope.ts on the server) requires membership of
--          BOTH sides. A Location 2 user who is not a D1 Imports member sees
--          none of D1 Imports' history, mirror or not.
--        - A user who belongs ONLY to D1 Imports would still be shown it after
--          the archive — archiving someone's only shop deliberately never locks
--          them out (lib/shops/visibleShops.ts). Adding them to Location 2 is
--          what moves them there.
--
--   2. ARCHIVE. shops.archived_at is set on D1 Imports, only if it is not
--      already archived. The picker drops it, the sidebar switcher (and its
--      mirror toggle) disappears, and anyone whose active shop was D1 Imports
--      lands in Location 2 on their next page load.
--
-- Every row this file creates or changes is recorded in public.shop_merge_ledger
-- WITH ITS ROW VERSION (xmin) AND A FULL SNAPSHOT, so the emergency rollback
-- can prove a row is still exactly what the merge left — and refuse to touch
-- one that was changed, or deleted and recreated, afterwards.
--
-- Not touched: shop_mirrors (both links stay; Shop 2 -> Shop 1 is now
-- load-bearing), shop_settings, document counters, audit_events, storage,
-- billing. The D1 Imports shop row is never deleted.
--
-- Safe to rerun: existing memberships are skipped, an archived shop is left
-- as it is, and a rerun records nothing new.
-- ============================================================================

BEGIN;

-- Snapshots include timestamps, whose jsonb text depends on the session time
-- zone. Pinning it makes the merge and its rollback compare like with like.
SET LOCAL TimeZone = 'UTC';

-- Hold off concurrent membership writes (invites, provisioning) for the few
-- milliseconds this takes, so the membership copy is computed from a stable set.
LOCK TABLE public.shop_users IN SHARE ROW EXCLUSIVE MODE;

-- ── Preconditions. Any failure aborts the whole transaction. ───────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.shops WHERE id = '38d55fae-741b-4bac-b520-f96eed65bf38') THEN
    RAISE EXCEPTION 'D1 Imports (38d55fae…) not found — wrong project?';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shops WHERE id = '90b72748-bf01-4456-999f-f4ba48091606') THEN
    RAISE EXCEPTION 'Location 2 (90b72748…) not found — wrong project?';
  END IF;
  IF EXISTS (SELECT 1 FROM public.shops
              WHERE id = '90b72748-bf01-4456-999f-f4ba48091606' AND archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Location 2 is archived — it is the shop that stays open. Stopping.';
  END IF;
  -- Without this link, archiving D1 Imports would hide its history entirely.
  IF NOT EXISTS (SELECT 1 FROM public.shop_mirrors
                  WHERE shop_id        = '90b72748-bf01-4456-999f-f4ba48091606'
                    AND mirror_shop_id = '38d55fae-741b-4bac-b520-f96eed65bf38') THEN
    RAISE EXCEPTION 'Location 2 does not mirror D1 Imports — its history would become invisible. Stopping.';
  END IF;
END $$;


-- ── Ledger: what this merge created or changed, with row-version evidence ──
CREATE TABLE IF NOT EXISTS public.shop_merge_ledger (
  id              BIGSERIAL   PRIMARY KEY,
  merge_key       TEXT        NOT NULL,
  kind            TEXT        NOT NULL CHECK (kind IN ('membership', 'archive')),
  shop_id         UUID        NOT NULL,
  user_id         UUID,
  -- xmin of the row exactly as this merge left it. Any later UPDATE (even one
  -- that writes identical values) or a DELETE + re-INSERT gives the row a new
  -- xmin, which is how the rollback tells "still ours" from "changed since".
  row_xmin        TEXT        NOT NULL,
  -- The whole row as this merge left it (to_jsonb of shop_users / the archive
  -- columns of shops), compared alongside xmin.
  row_snapshot    JSONB       NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'applied'
                  CHECK (status IN ('applied', 'rolled_back', 'absent_at_rollback', 'kept_by_owner')),
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  CHECK ((kind = 'membership') = (user_id IS NOT NULL))
);

-- At most one live entry per row, so a rerun cannot double-record.
CREATE UNIQUE INDEX IF NOT EXISTS shop_merge_ledger_one_applied
  ON public.shop_merge_ledger (merge_key, kind, shop_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'applied';

-- RLS on with no policies: invisible to anon and authenticated through the
-- API. Only the SQL editor (postgres) and service_role read it.
ALTER TABLE public.shop_merge_ledger ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.shop_merge_ledger IS
  'Rows a shop merge created or changed, with their xmin and a snapshot, so the '
  'emergency rollback undoes exactly those and refuses rows changed since. '
  'See supabase/migrations/2026-10-16_shop_merge*.sql.';


-- ── 1. Membership: everyone in either shop joins the other, same role ──────
WITH missing AS (
  SELECT '90b72748-bf01-4456-999f-f4ba48091606'::uuid AS shop_id, su.user_id, su.role
  FROM public.shop_users su
  WHERE su.shop_id = '38d55fae-741b-4bac-b520-f96eed65bf38'
    AND NOT EXISTS (SELECT 1 FROM public.shop_users x
                     WHERE x.shop_id = '90b72748-bf01-4456-999f-f4ba48091606'
                       AND x.user_id = su.user_id)
  UNION ALL
  SELECT '38d55fae-741b-4bac-b520-f96eed65bf38'::uuid, su.user_id, su.role
  FROM public.shop_users su
  WHERE su.shop_id = '90b72748-bf01-4456-999f-f4ba48091606'
    AND NOT EXISTS (SELECT 1 FROM public.shop_users x
                     WHERE x.shop_id = '38d55fae-741b-4bac-b520-f96eed65bf38'
                       AND x.user_id = su.user_id)
),
inserted AS (
  INSERT INTO public.shop_users AS su (shop_id, user_id, role)
  SELECT shop_id, user_id, role FROM missing
  ON CONFLICT (shop_id, user_id) DO NOTHING
  RETURNING su.shop_id, su.user_id, su.xmin::text AS row_xmin, to_jsonb(su.*) AS row_snapshot
)
INSERT INTO public.shop_merge_ledger (merge_key, kind, shop_id, user_id, row_xmin, row_snapshot)
SELECT 'd1-location-merge-2026-10', 'membership', shop_id, user_id, row_xmin, row_snapshot
FROM inserted;


-- ── 2. Archive D1 Imports (only if not already archived) ───────────────────
WITH archived AS (
  UPDATE public.shops AS s
  SET archived_at     = now(),
      archived_reason = 'Location closed 2026-10; merged into D1 Imports — Location 2 '
                        '(90b72748-bf01-4456-999f-f4ba48091606). Records keep this shop_id '
                        'and are read through shop_mirrors.'
  WHERE s.id = '38d55fae-741b-4bac-b520-f96eed65bf38'
    AND s.archived_at IS NULL
  RETURNING s.id, s.xmin::text AS row_xmin,
            jsonb_build_object('archived_at', s.archived_at, 'archived_reason', s.archived_reason) AS row_snapshot
)
INSERT INTO public.shop_merge_ledger (merge_key, kind, shop_id, row_xmin, row_snapshot)
SELECT 'd1-location-merge-2026-10', 'archive', id, row_xmin, row_snapshot
FROM archived;

COMMIT;


-- ============================================================================
-- VERIFY — read-only. Run each query on its own (the SQL editor shows only the
-- last result of a multi-statement run).
-- ============================================================================

-- V1. Expect D1 Imports archived, Location 2 'active'.
SELECT name, coalesce(archived_at::text, 'active') AS state, archived_reason
FROM public.shops
WHERE id IN ('38d55fae-741b-4bac-b520-f96eed65bf38', '90b72748-bf01-4456-999f-f4ba48091606');

-- V2. Expect BOTH links still present (Location 2 -> D1 Imports is the one that matters).
SELECT shop_id, mirror_shop_id FROM public.shop_mirrors
WHERE shop_id IN ('38d55fae-741b-4bac-b520-f96eed65bf38', '90b72748-bf01-4456-999f-f4ba48091606');

-- V3. Expect ZERO rows: nobody belongs to one shop without the other.
SELECT su.user_id, su.shop_id AS only_in
FROM public.shop_users su
WHERE su.shop_id IN ('38d55fae-741b-4bac-b520-f96eed65bf38', '90b72748-bf01-4456-999f-f4ba48091606')
GROUP BY su.user_id, su.shop_id
HAVING (SELECT count(*) FROM public.shop_users x
         WHERE x.user_id = su.user_id
           AND x.shop_id IN ('38d55fae-741b-4bac-b520-f96eed65bf38', '90b72748-bf01-4456-999f-f4ba48091606')) < 2;

-- V4. Roles per user: each user's two roles must match their pre-merge role
-- (compare with the preflight's Q2).
SELECT u.email,
       max(su.role) FILTER (WHERE su.shop_id = '38d55fae-741b-4bac-b520-f96eed65bf38') AS shop1_role,
       max(su.role) FILTER (WHERE su.shop_id = '90b72748-bf01-4456-999f-f4ba48091606') AS shop2_role
FROM public.shop_users su
JOIN auth.users u ON u.id = su.user_id
WHERE su.shop_id IN ('38d55fae-741b-4bac-b520-f96eed65bf38', '90b72748-bf01-4456-999f-f4ba48091606')
GROUP BY u.email
ORDER BY u.email;

-- V5. What the merge recorded (exactly what an emergency rollback could undo).
SELECT l.kind, l.shop_id, u.email, l.row_snapshot ->> 'role' AS role, l.status, l.recorded_at
FROM public.shop_merge_ledger l
LEFT JOIN auth.users u ON u.id = l.user_id
WHERE l.merge_key = 'd1-location-merge-2026-10'
ORDER BY l.kind, l.shop_id, u.email;

-- V6. Nothing moved: re-run the preflight's Q1 and compare with the baseline.
-- shop1_rows must be unchanged in every table except shop_users and
-- shop_merge_ledger (D1 Imports is closed, so nothing new should land there).
-- shop2_rows may only grow, and only from normal use at Location 2.
