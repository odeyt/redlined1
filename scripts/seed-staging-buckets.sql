-- Storage buckets for the second Supabase project.
--
-- A schema dump does not carry these: a bucket is a row in storage.buckets,
-- not a schema object. Without this the app comes up looking healthy and every
-- photo upload fails at runtime — the failure appears in the browser, days
-- later, attached to whatever feature was being tested at the time.
--
--   psql "$STAGING_DB_URL" -f scripts/seed-staging-buckets.sql
--
-- Run this against the STAGING project only. It is idempotent.

BEGIN;

-- public = false is not a detail to be relaxed on staging "because it is only
-- test data". Staging exists to prove production's rules hold; a bucket that
-- is private in one and public in the other means the signed-URL render path
-- is never actually exercised, and the first time it runs for real is in front
-- of a customer. Same limits, same mime types, same visibility.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shop-assets',
  'shop-assets',
  false,
  10485760,  -- 10 MiB, matching 2026-08-12_shop_assets_bucket_limits.sql
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
SET public             = EXCLUDED.public,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;

-- Verification, deliberately after COMMIT.
--
-- Four migrations in this project have "run" without committing, always the
-- same shape: the statements execute, the session ends, nothing persists, and
-- the report says success. A SELECT inside the transaction would have shown
-- the intended state either way.
SELECT id, public, file_size_limit, allowed_mime_types
  FROM storage.buckets
 WHERE id = 'shop-assets';

-- Storage POLICIES are separate from the bucket row and live on
-- storage.objects. Whether the schema dump carried them across depends on
-- which schemas it included, so check rather than assume — an empty result
-- here means uploads and reads are unguarded, and every shop can see every
-- other shop's photos.
SELECT policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
 ORDER BY policyname;
