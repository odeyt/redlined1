-- ============================================================================
-- Cross-shop RLS hardening
--
-- Bug: a signed-in user with NO membership in a shop could read that shop's
-- parts, repair_orders, invoices and shop_settings. Confirmed in production on
-- 2026-07-30 with an account that has zero shop_users rows.
-- (customers, vehicles and job_cards were already correctly scoped — this
-- brings the remaining tenant tables in line with them.)
--
-- Model: a row is visible only when its shop_id is one of the shops the
-- calling user is a member of. Fail-closed: no membership → no rows.
-- The service-role key bypasses RLS, so server-side jobs are unaffected.
--
-- SAFE TO RERUN. Run in a transaction and verify with the checks at the bottom
-- BEFORE committing.
-- ============================================================================

BEGIN;

-- Membership helper. SECURITY DEFINER so the policy can read shop_users
-- without requiring a recursive policy on shop_users itself.
CREATE OR REPLACE FUNCTION public.user_shop_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.user_shop_ids() FROM public;
GRANT EXECUTE ON FUNCTION public.user_shop_ids() TO authenticated;

-- Apply a single strict membership policy per table, replacing whatever
-- permissive policies exist today.
DO $$
DECLARE
  t    text;
  pol  record;
BEGIN
  FOREACH t IN ARRAY ARRAY['parts', 'repair_orders', 'invoices', 'shop_settings']
  LOOP
    -- Skip tables that don't exist in this environment
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);

    -- Drop existing policies on this table (they are the source of the leak)
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    -- Read: only rows for shops the caller belongs to
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR SELECT TO authenticated
        USING (shop_id IN (SELECT public.user_shop_ids()))
    $f$, t || '_select_own_shop', t);

    -- Write: may only create/modify rows inside their own shops
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR INSERT TO authenticated
        WITH CHECK (shop_id IN (SELECT public.user_shop_ids()))
    $f$, t || '_insert_own_shop', t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR UPDATE TO authenticated
        USING (shop_id IN (SELECT public.user_shop_ids()))
        WITH CHECK (shop_id IN (SELECT public.user_shop_ids()))
    $f$, t || '_update_own_shop', t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR DELETE TO authenticated
        USING (shop_id IN (SELECT public.user_shop_ids()))
    $f$, t || '_delete_own_shop', t);
  END LOOP;
END $$;

-- ── Verification (read these before COMMIT) ─────────────────────────────────

-- 1. Every target table has exactly the four strict policies and RLS forced:
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('parts', 'repair_orders', 'invoices', 'shop_settings')
ORDER BY tablename, cmd;

-- 2. D1's own data is still intact and reachable by its members
--    (row counts must match what you had before this migration):
SELECT 'parts' AS t, count(*) FROM public.parts
  WHERE shop_id IN ('38d55fae-741b-4bac-b520-f96eed65bf38','90b72748-bf01-4456-999f-f4ba48091606')
UNION ALL SELECT 'repair_orders', count(*) FROM public.repair_orders
  WHERE shop_id IN ('38d55fae-741b-4bac-b520-f96eed65bf38','90b72748-bf01-4456-999f-f4ba48091606')
UNION ALL SELECT 'invoices', count(*) FROM public.invoices
  WHERE shop_id IN ('38d55fae-741b-4bac-b520-f96eed65bf38','90b72748-bf01-4456-999f-f4ba48091606');

COMMIT;
-- ROLLBACK;  -- use this instead if the verification output looks wrong
