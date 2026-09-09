-- ===========================================================================
-- shop-assets: fix "new row violates row-level security policy" on EVERY
-- new photo upload to an entity_images-backed prefix
--
-- READ THIS BEFORE RUNNING. Drafted 2026-09-09. APPLIED to production
-- 2026-09-09 (Part 1 run in the SQL editor against redlined1/main), and
-- confirmed by the operator immediately afterwards: attaching a photo to a
-- parts quotation works again. That upload is the only proof that matters
-- here — see 2026-08-12_shop_assets_scoped_writes.sql on why no automated
-- check in this repo can demonstrate this function returning TRUE.
--
-- SYMPTOM
-- -------
-- Operator report, 2026-09-09, with screenshot: Parts Quotation -> Edit ->
-- attach a photo, and the upload dies immediately with
--
--     UPLOAD FAILED: NEW ROW VIOLATES ROW-LEVEL SECURITY POLICY
--
-- ("unable to drag and drop or add pictures.") That message is Postgres
-- rejecting the INSERT into storage.objects, surfaced by
-- services/entityImageService.ts's uploadEntityImage(). It is not the
-- entity_images INSERT: that table's policy is `using (true) with check
-- (true)` (supabase/migrations/entity_images.sql) and rejects nothing.
--
-- ROOT CAUSE — a chicken-and-egg introduced by the 2026-09-07 fix
-- --------------------------------------------------------------
-- 2026-09-07_shop_assets_entity_images_reassigned_fix.sql rewrote the
-- entity_images-backed branch of can_read_shop_asset() to authorize by
-- looking for an entity_images row whose url contains the object path:
--
--     when prefix in ('job_cards','repair_orders','appointments',
--                     'parts_orders','parts_estimates')
--       then exists (select 1 from entity_images ei
--                    where position(('/shop-assets/' || object_name) in ei.url) > 0
--                      and ei.shop_id in (my shops))
--
-- That is the right question for a READ. It is unanswerable on an UPLOAD.
-- can_read_shop_asset() is shared by all four storage.objects policies
-- (2026-08-12_shop_assets_scoped_writes.sql deliberately reused it: "'Does
-- this user's shop own this path' is the same question for reads and
-- writes"), so it also gates INSERT — and uploadEntityImage() necessarily
-- puts the object in the bucket FIRST and inserts the entity_images row
-- from the resulting public url SECOND. At the moment the INSERT is
-- checked, the row the check looks for cannot exist yet. The branch
-- returns false for every new upload, for every one of the five prefixes.
--
-- 2026-08-12_shop_assets_scoped_writes.sql called this exact failure in a
-- header, at a time when it was not yet true:
--
--     "The specific risk is upload ORDER. ... If any code path uploads a
--      photo BEFORE inserting the row it belongs to, that upload starts
--      failing the moment this lands."
--
-- It was safe then, because the branch resolved the ENTITY the path names
-- (parts_estimates/<id> -> parts_estimates row -> shop), and the quotation
-- being photographed always already exists. The 2026-09-07 rewrite dropped
-- that lookup in favour of the entity_images one and inherited the risk
-- the older file had already written down. Both files' "APPLIED / verified"
-- notes were about reads; nothing re-ran the five-point upload test
-- afterwards, which is why this reached an operator instead of a migration.
--
-- THE FIX
-- -------
-- Authorize the five entity_images-backed prefixes when EITHER check
-- passes:
--
--   (a) an entity_images row for this object belongs to one of my shops
--       — 2026-09-07's check, the only one that works for a photo
--       reassigned quotation -> order, or one whose entity was since
--       deleted; or
--   (b) the entity the path names belongs to one of my shops
--       — 2026-08-12's check, the only one that works for an object being
--       uploaded right now, before its entity_images row exists.
--
-- Neither alone covers both cases; each is exactly the other's blind spot.
-- OR-ing them restores uploads without giving back the broken reads.
--
-- BLAST RADIUS
-- ------------
-- Strictly widening, and only back to the union of two authorization rules
-- this bucket has already run in production (08-12 through 09-07, and
-- 09-07 through now). Both operands resolve to "a shop_id I am a member of
-- via shop_users"; neither is client-suppliable. Unrecognised prefixes
-- still deny by default, and logo/parts/vehicles/inspections are untouched.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- PART 0 — INSPECTION. Run first. Nothing here changes anything.
--
-- Confirms the installed function is 2026-09-07's (entity_images-only
-- branch, no parts_estimates/job_cards/... table lookups) — i.e. that this
-- migration is the one that is needed.
-- ---------------------------------------------------------------------------

select pg_get_functiondef('public.can_read_shop_asset(text)'::regprocedure);


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
    -- Unchanged since 2026-08-12 — not entity_images-backed, verified working.
    when (select prefix from parts) = 'vehicles' then exists (
      select 1 from public.vehicles v
      where v.id::text = (select ident from parts)
        and v.shop_id::text in (select shop_id from mine))

    when (select prefix from parts) = 'inspections' then exists (
      select 1 from public.inspections i
      where i.id::text = (select ident from parts)
        and i.shop_id::text in (select shop_id from mine))

    -- entity_images-backed paths: `${entityType}s/${entityId}/...`.
    --
    -- (a) the photo's own entity_images row — the only check that survives
    --     reassignEntityImages() moving a photo quotation -> order, or the
    --     entity named in the path being deleted (2026-09-07); and
    -- (b) the entity the path names — the only check that can pass while
    --     the object is still being uploaded, since uploadEntityImage()
    --     writes the storage object before it can know the url to store in
    --     entity_images (2026-08-12, restored here 2026-09-09).
    --
    -- Either is sufficient. Requiring (a) alone denied every new upload.
    when (select prefix from parts) in
      ('job_cards', 'repair_orders', 'appointments', 'parts_orders', 'parts_estimates')
      then
        exists (
          select 1 from public.entity_images ei
          where position(('/shop-assets/' || object_name) in ei.url) > 0
            and ei.shop_id::text in (select shop_id from mine))
        or exists (
          select 1 from public.job_cards j
          where (select prefix from parts) = 'job_cards'
            and j.id::text = (select ident from parts)
            and j.shop_id::text in (select shop_id from mine))
        or exists (
          select 1 from public.repair_orders r
          where (select prefix from parts) = 'repair_orders'
            and r.id::text = (select ident from parts)
            and r.shop_id::text in (select shop_id from mine))
        or exists (
          select 1 from public.appointments a
          where (select prefix from parts) = 'appointments'
            and a.id::text = (select ident from parts)
            and a.shop_id::text in (select shop_id from mine))
        or exists (
          select 1 from public.parts_orders p
          where (select prefix from parts) = 'parts_orders'
            and p.id::text = (select ident from parts)
            and p.shop_id::text in (select shop_id from mine))
        or exists (
          select 1 from public.parts_estimates p
          where (select prefix from parts) = 'parts_estimates'
            and p.id::text = (select ident from parts)
            and p.shop_id::text in (select shop_id from mine))

    -- Deny by default. A new upload path added in application code without a
    -- matching branch here becomes unreadable rather than world-readable.
    else false
  end;
$$;

comment on function public.can_read_shop_asset(text) is
  'True when the current user is a member of the shop owning this shop-assets object. Used by the storage.objects SELECT/INSERT/UPDATE/DELETE policies. entity_images-backed prefixes pass on EITHER the entity_images row''s shop_id (survives reassignment, or deletion of the entity the path names — 2026-09-07) OR the named entity''s shop_id (the only check available while the object is still being uploaded — 2026-09-09). Deny-by-default on unknown path prefixes.';


-- ---------------------------------------------------------------------------
-- VERIFY — after Part 1. Re-read the installed definition and confirm it
-- matches this file (both operands present in the entity_images branch, and
-- logo/parts/vehicles/inspections all still there). Do not trust the
-- editor's "Success" — 2026-09-07 installed a wrong body once and only
-- pg_get_functiondef() caught it.
-- ---------------------------------------------------------------------------

select pg_get_functiondef('public.can_read_shop_asset(text)'::regprocedure);

-- Then, signed in as a real shop member, in the actual UI:
--   1. Parts Quotation -> Edit -> attach a photo       (the reported failure)
--   2. that photo renders after saving                 (read path still ok)
--   3. Parts Ordered -> Edit an order with photos from before it was a
--      quotation -> they still render                  (2026-09-07 still ok)
--   4. vehicle photo upload + delete                   (untouched branches)
--   5. shop logo change                                (untouched branches)


-- ---------------------------------------------------------------------------
-- ROLLBACK — restores 2026-09-07's function exactly. Note that doing so
-- re-breaks every new photo upload on the five entity_images prefixes; it is
-- only worth running if this change somehow breaks reads instead.
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
--     select shop_id::text as shop_id from public.shop_users where user_id = auth.uid()
--   )
--   select case
--     when (select prefix from parts) in ('logo', 'parts')
--       then (select ident from parts) in (select shop_id from mine)
--     when (select prefix from parts) = 'vehicles' then exists (
--       select 1 from public.vehicles v
--       where v.id::text = (select ident from parts)
--         and v.shop_id::text in (select shop_id from mine))
--     when (select prefix from parts) = 'inspections' then exists (
--       select 1 from public.inspections i
--       where i.id::text = (select ident from parts)
--         and i.shop_id::text in (select shop_id from mine))
--     when (select prefix from parts) in
--       ('job_cards', 'repair_orders', 'appointments', 'parts_orders', 'parts_estimates')
--       then exists (
--         select 1 from public.entity_images ei
--         where position(('/shop-assets/' || object_name) in ei.url) > 0
--           and ei.shop_id::text in (select shop_id from mine))
--     else false
--   end;
-- $$;
-- ===========================================================================
