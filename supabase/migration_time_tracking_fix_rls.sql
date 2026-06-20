-- Fix time_entries RLS: replace broken app.shop_id session-var policy
-- with my_shop_ids() used by every other table in the system.

DROP POLICY IF EXISTS "shop_isolation" ON time_entries;

CREATE POLICY "time_entries_shop_scoped" ON time_entries
  FOR ALL TO authenticated
  USING  (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));
