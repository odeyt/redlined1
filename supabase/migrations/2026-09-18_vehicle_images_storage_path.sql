-- Vehicle photos: store the storage KEY, not a URL.
--
-- NOT APPLIED. Preview and rollback are part of this file. Do not run any
-- step against production without owner approval at the matching gate.
--
-- WHY
--
-- `vehicle_images.url` holds a fully-qualified Supabase URL. That was a
-- reasonable thing to store while the bucket was public: the stored value was
-- also a working value. Since the bucket flipped to private (confirmed live
-- 2026-09-07, see 2026-09-07_shop_assets_entity_images_reassigned_fix.sql) it
-- is not. Every read now has to be signed, a signature expires in an hour,
-- and the durable reference has to be the object key:
--
--     vehicles/<vehicle-id>/<file>
--
-- The URL is a legacy encoding of that key. Parsing it at render time works,
-- but it means every consumer re-derives the key by string-slicing on
-- "/shop-assets/" with no idea what host or prefix it is looking at, and it
-- means the column CAN hold an expiring signed URL without anything noticing.
-- lib/storage/vehiclePhotoRef.ts is the strict parse; this column is where
-- the result of that parse is kept so it is done once.
--
-- WHAT CHANGES
--
--   1. vehicle_images.storage_path text, nullable. The canonical key.
--   2. A backfill that fills it ONLY from URLs that positively match this
--      project's host, the shop-assets bucket, and the vehicles/<uuid>/<file>
--      shape. Anything else is left NULL and keeps working through the
--      application's existing URL fallback.
--
-- WHAT DOES NOT CHANGE
--
--   * `url` is never modified and never dropped. Both columns are written by
--     new uploads for the whole transition, so a rollback to the previous
--     application build finds exactly the data it expects.
--   * No storage object is touched. This file contains no storage.objects
--     statement of any kind.
--   * No policy, grant or RLS rule changes. Supabase grants privileges at the
--     table level to `authenticated`, so the new column inherits the table's
--     existing grants; a column-level grant here would be overridden by the
--     table-level one anyway.
--
-- IDEMPOTENT: every step is safe to run twice. ADD COLUMN IF NOT EXISTS, and
-- the backfill only ever writes rows where storage_path IS NULL.
--
-- REVERSIBLE: step 5. `url` is untouched, so dropping the column returns the
-- table to exactly its current state with no data loss.
--
-- RUN AS SEPARATE EXECUTIONS. The verification probe runs after the change is
-- committed so a failing probe can never roll back what it is checking.
-- ============================================================================


-- ===========================================================================
-- STEP 1: preflight. READ ONLY. Run alone; these counts are the "before".
-- ===========================================================================
--
-- Classification mirrors lib/storage/vehiclePhotoRef.ts. `legacy_signed_url`
-- is the class that matters most: an expiring token that was persisted.

WITH classified AS (
  SELECT
    CASE
      WHEN url IS NULL OR btrim(url) = '' THEN 'no_reference'
      WHEN url ~ '^https://ldjrlvjkmzrcdqhetqoh\.supabase\.co/storage/v1/object/sign/shop-assets/'
        THEN 'legacy_signed_url'
      WHEN url ~ '^https://ldjrlvjkmzrcdqhetqoh\.supabase\.co/storage/v1/object/public/shop-assets/vehicles/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[^/?#%]+(\?.*)?$'
        THEN 'canonical_public_url'
      ELSE 'other'
    END AS class
  FROM public.vehicle_images
)
SELECT class, count(*) AS rows
FROM classified
GROUP BY class
ORDER BY class;


-- ===========================================================================
-- STEP 2: add the column. Idempotent.
-- ===========================================================================

ALTER TABLE public.vehicle_images
  ADD COLUMN IF NOT EXISTS storage_path text;

COMMENT ON COLUMN public.vehicle_images.storage_path IS
  'Bucket-relative object key in shop-assets, vehicles/<vehicle-id>/<file>. '
  'Canonical. Never a URL, never signed. `url` is the legacy encoding kept for '
  'backward compatibility during the transition.';


-- ===========================================================================
-- STEP 3: backfill PREVIEW. READ ONLY. Run alone and read the sample.
-- ===========================================================================
--
-- Shows what step 4 would write. The sample deliberately prints only the
-- vehicle id and the derived key — no url, no token, no customer data.

WITH derived AS (
  SELECT
    vi.id,
    vi.vehicle_id,
    (regexp_match(
       split_part(vi.url, '?', 1),
       '^https://ldjrlvjkmzrcdqhetqoh\.supabase\.co/storage/v1/object/(?:public|sign)/shop-assets/(vehicles/[0-9a-fA-F-]{36}/[^/?#%]+)$'
     ))[1] AS path
  FROM public.vehicle_images vi
  WHERE vi.storage_path IS NULL
)
SELECT
  count(*) FILTER (WHERE path IS NOT NULL)                             AS will_backfill,
  count(*) FILTER (WHERE path IS NULL)                                 AS will_be_left_null,
  count(*) FILTER (WHERE path IS NOT NULL
                     AND split_part(path, '/', 2) <> vehicle_id::text) AS path_names_a_different_vehicle
FROM derived;

-- Sample of 20, safe fields only.
WITH derived AS (
  SELECT
    vi.vehicle_id,
    (regexp_match(
       split_part(vi.url, '?', 1),
       '^https://ldjrlvjkmzrcdqhetqoh\.supabase\.co/storage/v1/object/(?:public|sign)/shop-assets/(vehicles/[0-9a-fA-F-]{36}/[^/?#%]+)$'
     ))[1] AS path
  FROM public.vehicle_images vi
  WHERE vi.storage_path IS NULL
)
SELECT vehicle_id, path
FROM derived
WHERE path IS NOT NULL
ORDER BY vehicle_id
LIMIT 20;


-- ===========================================================================
-- STEP 4: backfill. The only writing statement in this file.
-- ===========================================================================
--
-- Writes storage_path only. Never touches `url`, never touches a row that
-- already has a storage_path, and never writes a key whose vehicle segment
-- disagrees with the row's own vehicle_id — that case is a real defect
-- (the object is readable by the wrong shop under can_read_shop_asset) and
-- is left for the reconciliation report to surface rather than baked in here.

UPDATE public.vehicle_images vi
SET storage_path = d.path
FROM (
  SELECT
    id,
    vehicle_id,
    (regexp_match(
       split_part(url, '?', 1),
       '^https://ldjrlvjkmzrcdqhetqoh\.supabase\.co/storage/v1/object/(?:public|sign)/shop-assets/(vehicles/[0-9a-fA-F-]{36}/[^/?#%]+)$'
     ))[1] AS path
  FROM public.vehicle_images
  WHERE storage_path IS NULL
) d
WHERE vi.id = d.id
  AND d.path IS NOT NULL
  AND split_part(d.path, '/', 2) = d.vehicle_id::text;


-- ===========================================================================
-- STEP 5: verification. READ ONLY. Run after step 4 has committed.
-- ===========================================================================

SELECT
  count(*)                                                      AS rows_total,
  count(storage_path)                                           AS rows_with_key,
  count(*) FILTER (WHERE storage_path IS NULL)                  AS rows_without_key,
  count(*) FILTER (WHERE storage_path IS NOT NULL
                     AND storage_path !~ '^vehicles/[0-9a-fA-F-]{36}/[^/]+$')
                                                                AS malformed_keys,
  count(*) FILTER (WHERE storage_path IS NOT NULL
                     AND split_part(storage_path, '/', 2) <> vehicle_id::text)
                                                                AS key_vehicle_mismatch,
  count(*) FILTER (WHERE storage_path LIKE '%token=%'
                      OR storage_path LIKE 'http%')             AS keys_that_are_urls
FROM public.vehicle_images;

-- malformed_keys, key_vehicle_mismatch and keys_that_are_urls must all be 0.


-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
--
-- `url` was never modified, so this is lossless: the table returns to exactly
-- its pre-migration state and the previous application build reads it
-- unchanged. Run only if the deployment is being reverted.
--
--   ALTER TABLE public.vehicle_images DROP COLUMN IF EXISTS storage_path;
