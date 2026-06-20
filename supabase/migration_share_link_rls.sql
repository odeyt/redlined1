-- Allow anonymous (unauthenticated) users to read inspections via share token.
-- This enables public share links to work even when SUPABASE_SERVICE_ROLE_KEY
-- is not set in the deployment environment, since the GET handler falls back
-- to the anon key with no JWT.
CREATE POLICY "inspections_public_share_read"
  ON public.inspections
  FOR SELECT
  TO anon
  USING (share_token IS NOT NULL);
