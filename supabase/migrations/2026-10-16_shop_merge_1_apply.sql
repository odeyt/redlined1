-- ============================================================================
-- Shop merge — STEP 1: fold D1 Imports (closed) into D1 Imports — Location 2.
--
--   Shop 1  D1 Imports              38d55fae-741b-4bac-b520-f96eed65bf38  (closed)
--   Shop 2  D1 Imports — Location 2 90b72748-bf01-4456-999f-f4ba48091606  (keeps)
--
-- RUN AFTER the application change (PR "shop merge: fold a closed location
-- into the one that stays open") is deployed. The code reads merged history
-- into the dashboard, reports and invoice vehicle picker; it is harmless while
-- nothing is archived, so it goes first.
--
-- RUN AFTER STEP 0 (2026-10-16_shop_merge_0_inventory.sql) and reading its
-- results. Run this whole file in the Supabase SQL editor as one execution.
--
-- ---------------------------------------------------------------------------
-- What this does — and does not — do
-- ---------------------------------------------------------------------------
--
-- NO ROW MOVES. Every job card, estimate, RO, invoice, payment, customer and
-- vehicle keeps shop_id = Shop 1. Location 2 already reads them through the
-- shop_mirrors link (Shop 2 -> Shop 1), and already edits them: the services
-- scope their updates with getShopIds(). New records go to Location 2.
--
-- Two writes, both reversible by 2026-10-16_shop_merge_9_rollback.sql:
--
--   1. MEMBERSHIP. Every member of either shop becomes a member of the other,
--      with the role they already hold. Required, not tidying:
--        - RLS shows a row only to members of its shop, and the mirror policy
--          (and lib/shops/mirrorScope.ts on the server) requires membership of
--          BOTH sides. A Location 2 user who is not a D1 Imports member sees
--          none of D1 Imports' history, mirror or not.
--        - A user who belongs ONLY to D1 Imports would, after step 2, still be
--          shown it — archiving someone's only shop deliberately never locks
--          them out (lib/shops/visibleShops.ts). Adding them to Location 2 is
--          what moves them there.
--      Each inserted membership is recorded in public.shop_merge_ledger so the
--      rollback removes exactly those rows and nothing that existed before.
--
--   2. ARCHIVE. shops.archived_at is set on D1 Imports. The location picker
--      drops it, the sidebar switcher disappears (it renders only for more than
--      one shop, so the mirror toggle that could break this goes with it), and
--      anyone whose active shop was D1 Imports is moved to Location 2 on their
--      next page load.
--
-- Not touched: shop_mirrors (both links stay — the Shop 2 -> Shop 1 link is now
-- load-bearing), shop_settings, document counters, audit_events, storage.
-- The D1 Imports shop row itself is never deleted: audit_events refuses
-- deletion and its rows reference it.
--
-- Safe to rerun: memberships use ON CONFLICT DO NOTHING and the archive only
-- applies while the shop is unarchived.
-- ============================================================================

BEGIN;

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


-- ── Ledger of what this merge inserted, for an exact rollback ──────────────
CREATE TABLE IF NOT EXISTS public.shop_merge_ledger (
  merge_key      TEXT        NOT NULL,
  shop_id        UUID        NOT NULL,
  user_id        UUID        NOT NULL,
  role           TEXT        NOT NULL,
  inserted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  rolled_back_at TIMESTAMPTZ,
  PRIMARY KEY (merge_key, shop_id, user_id)
);

-- RLS on with no policies: invisible to anon and authenticated through the
-- API. Only the SQL editor (postgres) and service_role read it.
ALTER TABLE public.shop_merge_ledger ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.shop_merge_ledger IS
  'shop_users rows inserted by a shop merge, so its rollback deletes exactly '
  'those and nothing that existed before. See 2026-10-16_shop_merge_*.sql.';


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
  INSERT INTO public.shop_users (shop_id, user_id, role)
  SELECT shop_id, user_id, role FROM missing
  ON CONFLICT (shop_id, user_id) DO NOTHING
  RETURNING shop_id, user_id, role
)
INSERT INTO public.shop_merge_ledger (merge_key, shop_id, user_id, role)
SELECT 'd1-location-merge-2026-10', shop_id, user_id, role FROM inserted
ON CONFLICT (merge_key, shop_id, user_id)
  DO UPDATE SET role = EXCLUDED.role, inserted_at = now(), rolled_back_at = NULL;


-- ── 2. Archive D1 Imports ──────────────────────────────────────────────────
UPDATE public.shops
SET archived_at     = now(),
    archived_reason = 'Location closed 2026-10; merged into D1 Imports — Location 2 '
                      '(90b72748-bf01-4456-999f-f4ba48091606). Records keep this shop_id '
                      'and are read through shop_mirrors.'
WHERE id = '38d55fae-741b-4bac-b520-f96eed65bf38'
  AND archived_at IS NULL;

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

-- V4. What the merge added (these are what the rollback removes).
SELECT l.shop_id, u.email, l.role, l.inserted_at
FROM public.shop_merge_ledger l
LEFT JOIN auth.users u ON u.id = l.user_id
WHERE l.merge_key = 'd1-location-merge-2026-10' AND l.rolled_back_at IS NULL
ORDER BY l.shop_id, u.email;

-- V5. Nothing moved: these counts must equal STEP 0's Q1 for the same tables.
SELECT
  (SELECT count(*) FROM public.job_cards     WHERE shop_id = '38d55fae-741b-4bac-b520-f96eed65bf38') AS d1_job_cards,
  (SELECT count(*) FROM public.repair_orders WHERE shop_id = '38d55fae-741b-4bac-b520-f96eed65bf38') AS d1_repair_orders,
  (SELECT count(*) FROM public.estimates     WHERE shop_id = '38d55fae-741b-4bac-b520-f96eed65bf38') AS d1_estimates,
  (SELECT count(*) FROM public.invoices      WHERE shop_id = '38d55fae-741b-4bac-b520-f96eed65bf38') AS d1_invoices,
  (SELECT count(*) FROM public.payments      WHERE shop_id = '38d55fae-741b-4bac-b520-f96eed65bf38') AS d1_payments,
  (SELECT count(*) FROM public.customers     WHERE shop_id = '38d55fae-741b-4bac-b520-f96eed65bf38') AS d1_customers,
  (SELECT count(*) FROM public.vehicles      WHERE shop_id = '38d55fae-741b-4bac-b520-f96eed65bf38') AS d1_vehicles;

-- In the app afterwards: sign in, reload. Expect no location switcher, the
-- Location 2 header, and D1 Imports' customers, vehicles, job cards, estimates,
-- ROs, invoices and payments listed alongside Location 2's.
