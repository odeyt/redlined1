-- Fix: feature_flags table blocks service_role due to FORCE ROW LEVEL SECURITY.
-- This adds an explicit permissive policy so the service role (used by API routes
-- via getAdminDb()) can read and write all rows without RLS interference.

-- Allow service_role full access (bypasses the "permission denied" error in logs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'feature_flags' AND policyname = 'service_role_all_access'
  ) THEN
    EXECUTE 'CREATE POLICY service_role_all_access ON feature_flags
      FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- Also allow authenticated users to SELECT their own flags (for /api/feature-flags client reads)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'feature_flags' AND policyname = 'authenticated_read_global'
  ) THEN
    EXECUTE 'CREATE POLICY authenticated_read_global ON feature_flags
      FOR SELECT TO authenticated USING (
        scope = ''global''
        OR shop_id IN (
          SELECT shop_id FROM shop_users WHERE user_id = auth.uid()
        )
      )';
  END IF;
END $$;
