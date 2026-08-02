-- ============================================================================
-- Phase 6/7 — storage.objects policy for the `shop-assets` bucket
-- DRAFTED, NOT YET APPLIED. See docs/STORAGE_SECURITY_AUDIT.md for the
-- full audit this remediates and why this is deliberately minimal.
--
-- Scope: blocks `anon` from uploading/updating/deleting objects in this
-- bucket. Does NOT attempt shop-path scoping (current upload paths don't
-- encode shop_id at all — see docs/STORAGE_SECURITY_AUDIT.md), and does
-- NOT make the bucket private (every existing image URL in the live app is
-- a public URL today; flipping to private before every caller migrates to
-- signed URLs would break them all immediately). Both of those are
-- explicitly scoped as a separate, coordinated follow-up requiring
-- application code changes across every `*ImageService.ts` file, not
-- something to bundle into this database-only migration.
--
-- This does not change the bucket's public/private flag, so reads are
-- unaffected by this migration — it only affects who can write.
-- ============================================================================

DROP POLICY IF EXISTS "shop_assets_authenticated_write" ON storage.objects;
CREATE POLICY "shop_assets_authenticated_write" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'shop-assets');

DROP POLICY IF EXISTS "shop_assets_authenticated_update" ON storage.objects;
CREATE POLICY "shop_assets_authenticated_update" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'shop-assets')
  WITH CHECK (bucket_id = 'shop-assets');

DROP POLICY IF EXISTS "shop_assets_authenticated_delete" ON storage.objects;
CREATE POLICY "shop_assets_authenticated_delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'shop-assets');

-- No policy is created for `anon` on any command — with RLS already
-- enabled on storage.objects (Supabase enables this by default on the
-- managed storage schema) and no matching policy, anon is denied
-- insert/update/delete on this bucket by default-deny. Read access is
-- governed by the bucket's public/private flag, not by these policies —
-- unchanged by this migration, see docs/STORAGE_SECURITY_AUDIT.md.
