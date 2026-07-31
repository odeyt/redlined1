-- ============================================================================
-- Fix: multi-shop mirroring has never worked in the app
--
-- FINDING (verified 2026-07-31): a signed-in user reading public.shop_mirrors
-- gets "permission denied for table shop_mirrors". lib/useShop.ts discarded
-- that error, so a permissions failure was indistinguishable from "this shop
-- has no mirrors" — mirroring silently did nothing even though the rows were
-- correctly configured in both directions:
--
--     38d55fae… (D1 Imports)            -> 90b72748… (Location 2)
--     90b72748… (Location 2)            -> 38d55fae… (D1 Imports)
--
-- Consequence: getShopIds() only ever returned the active shop, so each
-- location saw only its own customers, vehicles, parts, job cards and
-- invoices, and cross-location edits could not match a row.
--
-- FIX: grant SELECT to `authenticated` and add a row-level policy restricting
-- visibility to links involving a shop the caller belongs to. Read-only: only
-- service-role code may create or remove mirror links, so a user cannot grant
-- themselves visibility into another tenant's data by inserting a row.
--
-- Safe to rerun.
-- ============================================================================

BEGIN;

GRANT SELECT ON public.shop_mirrors TO authenticated;

ALTER TABLE public.shop_mirrors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shop_mirrors_select_own_shop ON public.shop_mirrors;

-- Both sides are checked: the caller must belong to the shop asking for its
-- mirrors AND to the shop being mirrored. Without the second condition a user
-- could discover, and then read through, a link pointing at a tenant they are
-- not a member of.
CREATE POLICY shop_mirrors_select_own_shop ON public.shop_mirrors
  FOR SELECT TO authenticated
  USING (
    shop_id IN (SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid())
    AND
    mirror_shop_id IN (SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid())
  );

-- Deliberately no INSERT / UPDATE / DELETE policy for `authenticated`.
-- Mirror links stay a service-role-only operation.

COMMIT;


-- ── Verification ────────────────────────────────────────────────────────────

-- 1. Expect one policy, cmd = SELECT.
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'shop_mirrors';

-- 2. Expect SELECT present for authenticated.
SELECT privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'authenticated'
  AND table_schema = 'public'
  AND table_name = 'shop_mirrors'
ORDER BY privilege_type;

-- 3. Mirror rows themselves are unchanged — expect the two links above.
SELECT shop_id, mirror_shop_id FROM public.shop_mirrors;
