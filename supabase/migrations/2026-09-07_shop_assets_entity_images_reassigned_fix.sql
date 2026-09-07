-- ===========================================================================
-- shop-assets: fix can_read_shop_asset() for photos reassigned between
-- entity types (parts quotation -> parts order, and the same shape
-- wherever else entity_images gets reassigned)
--
-- READ THIS BEFORE RUNNING. Drafted 2026-09-07. APPLIED to production
-- 2026-09-07 and confirmed via pg_get_functiondef() to match this file
-- exactly (search_path 'public','storage', all four branches present) —
-- after a first attempt installed a different, broken function body
-- (missing the logo/parts/vehicles branches entirely, which would have
-- taken out shop logos, parts-inventory photos and vehicle photos) that
-- was caught by re-checking pg_get_functiondef() rather than trusting the
-- editor UI or a "Success" message. Never skip that check on a function
-- this central again.
--
-- WHY
-- ---
-- 2026-08-12_shop_assets_scoped_writes.sql flagged this explicitly and never
-- got a follow-up: "It also de-risks step 4 (public = false): the four
-- prefixes exercised above resolve correctly for a member. Untested prefixes
-- remain job_cards, repair_orders, appointments, parts_orders and
-- parts_estimates." Step 4 (bucket flipped to private) has since happened —
-- confirmed live 2026-09-07, `select public from storage.buckets where id =
-- 'shop-assets'` returns false — and a real user report ("picture was saved
-- but does not show up", parts order photos) is exactly that untested gap
-- failing.
--
-- Root cause, confirmed against live data (join of entity_images to
-- parts_orders, 2026-09-07):
--
--   entity_id  = 7bfcf208-d821-4e0f-88fb-34400dbba56f   (a real, live
--                                                         parts_orders row)
--   url        = .../shop-assets/parts_estimates/e40843c7-.../<file>.jpeg
--
-- The entity_images ROW is correctly linked to today's parts order. The
-- STORAGE PATH still says parts_estimates/<the original quotation's id>,
-- because services/entityImageService.ts's reassignEntityImages() — used
-- when a quotation converts to an order — deliberately updates only the
-- database row's entity_type/entity_id, never the physical object path (its
-- own comment: "renaming objects would mean a copy, a delete and a
-- rewritten url for every photo, and any failure midway would lose the file
-- rather than merely mislabel it"). That trade-off was safe while the
-- bucket was public — a stale path still resolved. It is not safe now:
-- can_read_shop_asset() re-derives ownership by parsing the STORAGE PATH
-- and looking up the row it names, and the quotation that path names is
-- gone (conversion deletes the source quotation). A correctly-scoped photo
-- becomes permanently unreadable, not because anything is wrong with it,
-- but because the function is asking the wrong table.
--
-- Second, distinct case in the same query: some entity_images rows' own
-- referenced parts_orders no longer exist at all (order_exists null) — an
-- orphaned photo of a deleted order. The current function denies these too,
-- for the same reason (nothing left to resolve a shop from via the path).
--
-- THE FIX
-- -------
-- For the five prefixes that are always backed by an entity_images row
-- (job_cards, repair_orders, appointments, parts_orders, parts_estimates),
-- stop re-deriving ownership from the path's named entity. Check
-- entity_images.shop_id directly instead — the value
-- services/entityImageService.ts already keeps correct through every
-- reassignment and every delete, and the same source of truth the app
-- itself trusts for who may see a photo in the UI. This also fixes the
-- orphaned-order case for free: a photo of a deleted order was never
-- deleted itself, and there is no reason shop staff should lose access to
-- it because the order record is gone.
--
-- vehicles, inspections, logo and parts are untouched — none of them are
-- entity_images-backed, and all four were the ones actually verified
-- working in the 2026-08-12 five-point manual test.
--
-- BLAST RADIUS
-- ------------
-- Widens SELECT/INSERT/UPDATE/DELETE authorization (can_read_shop_asset is
-- shared by all three storage.objects policies) for the five prefixes above
-- from "the referenced entity's shop" to "the entity_images row's own
-- shop_id" — strictly a more reliable check, not a broader trust boundary:
-- entity_images.shop_id is application-controlled, never client-suppliable,
-- and already the column every other part of this codebase treats as
-- authoritative for these rows. Deny-by-default on unrecognised prefixes is
-- unchanged.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- PART 0 — INSPECTION. Run first. Confirms the fix is needed and estimates
-- how many photos are currently affected. Nothing here changes anything.
-- ---------------------------------------------------------------------------

-- How many entity_images rows, per entity_type, have a url whose path does
-- NOT match their own entity_id (the reassigned-photo case)?
select
  entity_type,
  count(*) filter (
    where position(entity_id in url) = 0
  ) as path_mismatch_count,
  count(*) as total_count
from entity_images
where entity_type in ('job_card', 'repair_order', 'appointment', 'parts_order', 'parts_estimate')
group by entity_type
order by entity_type;


-- ---------------------------------------------------------------------------
-- PART 1 — redefine the function. CREATE OR REPLACE, idempotent.
-- ---------------------------------------------------------------------------

create or replace function public.can_read_shop_asset(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  with parts as (
    select
      (storage.foldername(object_name))[1] as prefix,
      (storage.foldername(object_name))[2] as ident
  ),
  mine as (
    select shop_id::text as shop_id from public.shop_users where user_id = auth.uid()
  )
  select case

    -- Paths whose second segment IS the shop id.
    --   logo/{shopId}/shop-logo.ext
    --   parts/{shopId}/{partNumber}/{ts}.ext
    when (select prefix from parts) in ('logo', 'parts')
      then (select ident from parts) in (select shop_id from mine)

    -- Paths whose second segment is an entity id; resolve it to its shop.
    -- Unchanged from 2026-08-12 — not entity_images-backed, verified working.
    when (select prefix from parts) = 'vehicles' then exists (
      select 1 from public.vehicles v
      where v.id::text = (select ident from parts)
        and v.shop_id::text in (select shop_id from mine))

    when (select prefix from parts) = 'inspections' then exists (
      select 1 from public.inspections i
      where i.id::text = (select ident from parts)
        and i.shop_id::text in (select shop_id from mine))

    -- entity_images-backed paths: `${entityType}s/${entityId}/...`.
    -- Checked against entity_images.shop_id directly, not by re-resolving
    -- the entity the path names — see header. A photo reassigned to a new
    -- entity (quotation -> order) or whose entity was since deleted still
    -- resolves correctly, because the check no longer depends on that
    -- entity still existing under the id the path happens to contain.
    when (select prefix from parts) in
      ('job_cards', 'repair_orders', 'appointments', 'parts_orders', 'parts_estimates')
      then exists (
        select 1 from public.entity_images ei
        where position(('/shop-assets/' || object_name) in ei.url) > 0
          and ei.shop_id::text in (select shop_id from mine))

    -- Deny by default. A new upload path added in application code without a
    -- matching branch here becomes unreadable rather than world-readable.
    else false
  end;
$$;

comment on function public.can_read_shop_asset(text) is
  'True when the current user is a member of the shop owning this shop-assets object. Used by the storage.objects SELECT/INSERT/UPDATE/DELETE policies. entity_images-backed prefixes check entity_images.shop_id directly (2026-09-07) rather than re-resolving the entity the path names, since reassignEntityImages() can leave a path pointing at an entity that no longer exists under that id. Deny-by-default on unknown path prefixes.';


-- ---------------------------------------------------------------------------
-- VERIFY — after Part 1. Re-run Part 0's query: path_mismatch_count rows
-- should now be readable. Then, signed in as a real shop member whose
-- account has parts-order photos affected by this (per Part 0), confirm in
-- the actual UI: Parts Ordered -> Edit an order with photos from before it
-- was a quotation -> photos that were blank now render.
-- ---------------------------------------------------------------------------

select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by cmd, policyname;


-- ---------------------------------------------------------------------------
-- ROLLBACK — restores the exact 2026-08-12 function if this causes an
-- unexpected regression. Re-opens the entity_images-backed prefixes to the
-- narrower (currently broken for reassigned/orphaned photos) behavior —
-- not a security rollback, a correctness one.
-- ---------------------------------------------------------------------------
-- create or replace function public.can_read_shop_asset(object_name text)
-- returns boolean
-- language sql
-- stable
-- security definer
-- set search_path = public, storage
-- as $$
--   with parts as (
--     select
--       (storage.foldername(object_name))[1] as prefix,
--       (storage.foldername(object_name))[2] as ident
--   ),
--   mine as (
--     select shop_id::text as shop_id from shop_users where user_id = auth.uid()
--   )
--   select case (select prefix from parts)
--     when 'logo'  then (select ident from parts) in (select shop_id from mine)
--     when 'parts' then (select ident from parts) in (select shop_id from mine)
--     when 'vehicles' then exists (
--       select 1 from vehicles v
--       where v.id::text = (select ident from parts)
--         and v.shop_id::text in (select shop_id from mine))
--     when 'inspections' then exists (
--       select 1 from inspections i
--       where i.id::text = (select ident from parts)
--         and i.shop_id::text in (select shop_id from mine))
--     when 'job_cards' then exists (
--       select 1 from job_cards j
--       where j.id::text = (select ident from parts)
--         and j.shop_id::text in (select shop_id from mine))
--     when 'repair_orders' then exists (
--       select 1 from repair_orders r
--       where r.id::text = (select ident from parts)
--         and r.shop_id::text in (select shop_id from mine))
--     when 'appointments' then exists (
--       select 1 from appointments a
--       where a.id::text = (select ident from parts)
--         and a.shop_id::text in (select shop_id from mine))
--     when 'parts_orders' then exists (
--       select 1 from parts_orders p
--       where p.id::text = (select ident from parts)
--         and p.shop_id::text in (select shop_id from mine))
--     when 'parts_estimates' then exists (
--       select 1 from parts_estimates p
--       where p.id::text = (select ident from parts)
--         and p.shop_id::text in (select shop_id from mine))
--     else false
--   end;
-- $$;
-- ===========================================================================
