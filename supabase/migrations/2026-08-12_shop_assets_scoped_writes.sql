-- ===========================================================================
-- shop-assets: scope writes to the shop that owns the path
--
-- THE HOLE
-- --------
-- Confirmed in production 2026-08-12:
--
--   auth upload shop-assets  INSERT  {authenticated}  with_check (bucket_id = 'shop-assets')
--   auth update shop-assets  UPDATE  {authenticated}  using      (bucket_id = 'shop-assets')
--   auth delete shop-assets  DELETE  {authenticated}  using      (bucket_id = 'shop-assets')
--
-- None of the three asks who owns the path. Any authenticated user — a
-- technician at either location, or anyone who signs up — can overwrite or
-- DELETE every object in the bucket, including another shop's photos.
--
-- This is worse than the read hole that took most of today. A leaked photo is
-- bad; a deleted one is gone, and Supabase storage has no undelete. Vehicle
-- damage photos are evidence in a dispute about work performed.
--
-- THE FIX
-- -------
-- Reuse can_read_shop_asset() from 2026-08-12_shop_assets_scoped_read.sql.
-- "Does this user's shop own this path" is the same question for reads and
-- writes, so the same function answers it. (Its name says `read` only because
-- reads came first. Renaming it would mean dropping and recreating the read
-- policy that depends on it, which is churn for a comment's benefit.)
--
-- RISK — READ THIS
-- ----------------
-- Reads failing is invisible until someone looks. Writes failing is loud and
-- immediate: a technician photographs a car and gets an error.
--
-- The specific risk is upload ORDER. can_read_shop_asset() resolves
-- vehicles/{vehicleId}, inspections/{inspectionId}, job_cards/{id} and the
-- rest by looking the entity up in its table. If any code path uploads a
-- photo BEFORE inserting the row it belongs to, that upload starts failing
-- the moment this lands. Paths keyed directly on shop id (logo/, parts/) have
-- no such ordering dependency.
--
-- Traced on 2026-08-12, and the ordering looks safe:
--
--   * inspection photos — InspectionsView guards with `if (!editingId ||
--     !targetItemId) return`, and editingId is only ever set from a saved
--     row's ins.id, so the inspection exists before any upload.
--   * vehicle photos — keyed on vehicle.id / galleryVehicle.id, both
--     persisted rows.
--   * parts and logo — keyed on shop id directly, no dependency at all.
--
-- Entity images (job_cards/, repair_orders/, ...) were not traced caller by
-- caller; they follow the same "open the record, then attach a photo" shape,
-- but treat that as untested rather than verified.
--
-- Test after applying, in this order, and roll back if any fail:
--
--   1. vehicle photo   (VehiclesView, and the guided intake flow)
--   2. inspection item photo (GuidedInspection / InspectionsView camera)
--   3. part photo
--   4. shop logo       (Settings)
--   5. DELETING a vehicle photo — the delete path needs SELECT as well
--
-- Rollback is at the bottom and restores exactly what exists today.
-- ===========================================================================


-- STATUS 2026-08-12: APPLIED to production. Verified by reading pg_policies:
-- four "shop members ..." policies present, all three "auth ..." policies
-- gone. Re-running Part 1 afterwards raises 42710 (already exists) and rolls
-- back only that duplicate attempt — it does not disturb what is installed.
--
-- ALLOW SIDE VERIFIED 2026-08-12 by manual test as a signed-in shop member.
-- All five passed: vehicle photo upload, inspection item photo, part photo,
-- shop logo change, and vehicle photo DELETE (which needs SELECT as well as
-- DELETE, and was the one most likely to expose a gap).
--
-- This is the only evidence anywhere that can_read_shop_asset() returns TRUE
-- for real member paths. Every automated check available in this repo runs as
-- anon or the service role, and both only ever demonstrate denial — a
-- function that returned false for everyone would pass all of them. If that
-- function is ever edited, these five tests are what must be re-run, and
-- there is no substitute short of a staging environment.
--
-- It also de-risks step 4 (public = false): the four prefixes exercised above
-- resolve correctly for a member. Untested prefixes remain job_cards,
-- repair_orders, appointments, parts_orders and parts_estimates.

-- ---------------------------------------------------------------------------
-- PART 1 — create the scoped policies.
--
-- Policies of the same command are OR'd, so while both old and new exist
-- nothing is restricted. Safe to run on its own and stop.
-- ---------------------------------------------------------------------------

create policy "shop members upload shop-assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'shop-assets'
  and public.can_read_shop_asset(name)
);

-- UPDATE needs both: USING decides which existing rows may be targeted,
-- WITH CHECK decides what they may become. Omitting WITH CHECK would let a
-- caller rename an object they own into a path they do not.
create policy "shop members update shop-assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'shop-assets'
  and public.can_read_shop_asset(name)
)
with check (
  bucket_id = 'shop-assets'
  and public.can_read_shop_asset(name)
);

create policy "shop members delete shop-assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'shop-assets'
  and public.can_read_shop_asset(name)
);


-- ---------------------------------------------------------------------------
-- PART 2 — drop the permissive ones. THIS is the moment the hole closes.
--
-- Run separately from Part 1. Verified definitions, captured 2026-08-12,
-- so the rollback below is exact.
-- ---------------------------------------------------------------------------

drop policy "auth upload shop-assets" on storage.objects;
drop policy "auth update shop-assets" on storage.objects;
drop policy "auth delete shop-assets" on storage.objects;


-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------

-- Expect three "shop members ..." policies and no "auth ..." ones.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by cmd, policyname;


-- ---------------------------------------------------------------------------
-- ROLLBACK — if staff cannot upload or delete photos.
-- Restores today's behaviour exactly, including the hole. Break-glass only;
-- say so out loud if it is used, because it reopens cross-tenant deletion.
--
--   drop policy "shop members upload shop-assets" on storage.objects;
--   drop policy "shop members update shop-assets" on storage.objects;
--   drop policy "shop members delete shop-assets" on storage.objects;
--
--   create policy "auth upload shop-assets" on storage.objects
--     for insert to authenticated
--     with check (bucket_id = 'shop-assets'::text);
--
--   create policy "auth update shop-assets" on storage.objects
--     for update to authenticated
--     using (bucket_id = 'shop-assets'::text);
--
--   create policy "auth delete shop-assets" on storage.objects
--     for delete to authenticated
--     using (bucket_id = 'shop-assets'::text);
-- ---------------------------------------------------------------------------
