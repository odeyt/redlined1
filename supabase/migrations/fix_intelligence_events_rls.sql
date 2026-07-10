-- INFRA BUG 001: intelligence_events missing GRANT to authenticated role
-- Root cause: migration_intelligence_bus.sql granted authenticated access to
-- recommendations and intelligence_signals but omitted intelligence_events.
-- PostgreSQL returns 42501 before RLS is evaluated when the table-level GRANT
-- is absent. This fix is additive and idempotent.

-- Grant table-level access (PostgreSQL evaluates this before RLS)
GRANT SELECT ON TABLE intelligence_events TO authenticated;
GRANT ALL ON TABLE intelligence_events TO service_role;

-- Ensure the SELECT policy exists and is correctly scoped
DROP POLICY IF EXISTS "owner_manager_intelligence_events_select" ON intelligence_events;
CREATE POLICY "owner_manager_intelligence_events_select"
  ON intelligence_events FOR SELECT
  USING (
    shop_id IN (
      SELECT shop_id FROM shop_users
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'manager')
    )
  );

-- Service role policy (ALL) — service_role bypasses RLS but explicit policy is safe
DROP POLICY IF EXISTS "service_intelligence_events_all" ON intelligence_events;
CREATE POLICY "service_intelligence_events_all"
  ON intelligence_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
