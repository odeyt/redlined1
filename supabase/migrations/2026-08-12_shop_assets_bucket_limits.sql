-- shop-assets: enforce at the bucket what the client already enforces.
--
-- lib/image/prepareUpload.ts rejects non-images and caps size after
-- compression, and all five upload services now go through it. That is a
-- client-side gate: it governs our own code, not the storage API. Anyone
-- holding an anon key can POST to /storage/v1/object/shop-assets/... directly
-- and store a 200MB file of any type. These two settings are the server-side
-- half of the same rule.
--
-- Scope: NEW uploads only. Existing objects are untouched, no URL changes, no
-- reads affected. Reversible by setting both columns back to null.
--
-- The size limit sits above the client's 8MB post-compression cap so the two
-- do not fight; the client stays the one that produces the readable error.
-- The MIME list matches isAcceptedImage() in lib/image/prepareUpload.ts —
-- keep them in step if either changes.
--
-- NOT addressed here: the bucket is still public. Every stored object is
-- readable by anyone holding its URL. See the note at the bottom.

update storage.buckets
set
  file_size_limit = 10485760,  -- 10 MiB
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
where id = 'shop-assets';

-- Verify: expects one row, 10485760, and the five types above.
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'shop-assets';

-- ---------------------------------------------------------------------------
-- Deliberately NOT in this migration: `set public = false`.
--
-- 587 rows currently store fully-qualified public URLs
-- (vehicle_images.url, entity_images.url, parts.photos[], shop_settings.logo_url).
-- All five read paths call getPublicUrl(); there is not one createSignedUrl()
-- in the codebase. Flipping this column alone makes every one of those images
-- 404 immediately, including on /inspection/[token], /portal/[token] and
-- /status/[token] — the report links customers open without signing in, where
-- there is no session to sign a URL with.
--
-- Going private requires, in order: a signing helper, migrating all five read
-- paths off getPublicUrl, a server route to sign for the three unauthenticated
-- token pages, and widening next.config.ts images.remotePatterns beyond
-- '/storage/v1/object/public/**'. Only after all of that does this column flip.
-- ---------------------------------------------------------------------------
