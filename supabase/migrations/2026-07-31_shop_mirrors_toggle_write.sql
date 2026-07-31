-- ============================================================================
-- Allow the sidebar's mirror toggle to actually work
--
-- components/Sidebar.tsx has a per-shop mirror toggle that inserts into and
-- deletes from public.shop_mirrors from the browser. The read-access migration
-- earlier today granted SELECT only, so those writes fail — and the handler
-- ignores the error and reloads, so the toggle appears to do nothing.
--
-- Grants INSERT/DELETE scoped so a user may only link shops they are a member
-- of, on BOTH sides. Without the both-sides check a user could link their own
-- shop to a tenant they do not belong to and read straight through the mirror.
--
-- No UPDATE: a link is created or removed, never edited.
--
-- Safe to rerun.
-- ============================================================================

BEGIN;

GRANT INSERT, DELETE ON public.shop_mirrors TO authenticated;

DROP POLICY IF EXISTS shop_mirrors_insert_own_shops ON public.shop_mirrors;
DROP POLICY IF EXISTS shop_mirrors_delete_own_shops ON public.shop_mirrors;

CREATE POLICY shop_mirrors_insert_own_shops ON public.shop_mirrors
  FOR INSERT TO authenticated
  WITH CHECK (
    shop_id IN (SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid())
    AND
    mirror_shop_id IN (SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid())
  );

CREATE POLICY shop_mirrors_delete_own_shops ON public.shop_mirrors
  FOR DELETE TO authenticated
  USING (
    shop_id IN (SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid())
    AND
    mirror_shop_id IN (SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid())
  );

COMMIT;


-- ── Verification ────────────────────────────────────────────────────────────

-- Expect SELECT, INSERT, DELETE — and no UPDATE.
SELECT privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'authenticated'
  AND table_schema = 'public'
  AND table_name = 'shop_mirrors'
ORDER BY privilege_type;

-- Expect three policies: select / insert / delete, all membership-scoped.
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'shop_mirrors'
ORDER BY cmd;
