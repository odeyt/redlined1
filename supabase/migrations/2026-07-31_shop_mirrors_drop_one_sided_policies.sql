-- ============================================================================
-- SECURITY: drop one-sided shop_mirrors policies  [APPLIED 2026-07-31, VERIFIED]
--
-- FINDING (verified 2026-07-31): a user could create a mirror link from a shop
-- they belong to, to ANY shop — including a tenant they have no membership in.
-- Confirmed by inserting such a row from a normal account.
--
-- Cause: two pre-existing policies check only one side of the link.
--
--   shop_mirrors_manage  ALL     USING/WITH CHECK (shop_id = ANY(my_shop_ids()))
--   shop_mirrors_read    SELECT  USING            (shop_id = ANY(my_shop_ids()))
--
-- Neither constrains mirror_shop_id, so "link my shop to yours" passes. The
-- stricter *_own_shop(s) policies added earlier today check both sides, but
-- permissive policies are OR'd — one loose policy defeats a strict one. Same
-- shape as the auth_all_* leak found on parts/invoices this morning.
--
-- These policies pre-date today's work, but were unreachable because
-- `authenticated` had no GRANT on the table. Granting SELECT (to make
-- mirroring function) and later INSERT/DELETE (for the sidebar toggle)
-- activated them — so the exposure was introduced by those grants and must be
-- closed alongside them.
--
-- Impact was limited: a mirror link alone grants no data access. parts,
-- invoices, repair_orders and shop_settings each enforce my_shop_ids()
-- independently, and a non-member reading through a planted link returns zero
-- rows — verified. The defect is that mirror configuration was writable by
-- anyone, not that data leaked.
--
-- FIX: drop both one-sided policies. The three *_own_shop(s) policies remain
-- and cover SELECT, INSERT and DELETE with both-sides membership checks.
-- No UPDATE policy: links are created or removed, never edited.
--
-- Safe to rerun.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS shop_mirrors_manage ON public.shop_mirrors;
DROP POLICY IF EXISTS shop_mirrors_read   ON public.shop_mirrors;

COMMIT;


-- ── Verification ────────────────────────────────────────────────────────────

-- Expect exactly three rows: shop_mirrors_select_own_shop (SELECT),
-- shop_mirrors_insert_own_shops (INSERT), shop_mirrors_delete_own_shops (DELETE).
SELECT policyname, cmd, permissive
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'shop_mirrors'
ORDER BY cmd, policyname;

-- Expect only the two D1 links.
SELECT shop_id, mirror_shop_id FROM public.shop_mirrors;
