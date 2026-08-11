-- ===========================================================================
-- shop-assets: scope object reads to the shop that owns them
--
-- READ THIS BEFORE RUNNING. Part 0 is an inspection you run first and report
-- back; Part 2 depends on what it returns. Do not run the whole file blind.
--
-- WHY
-- ---
-- Probed against production on 2026-08-12 with the publishable (anon) key —
-- the key that ships in the client bundle and is visible to anyone who opens
-- devtools:
--
--   * anon CAN sign a URL for any object in shop-assets
--   * anon CAN list the bucket (vehicle folder IDs enumerated successfully)
--   * anon CANNOT upload ("new row violates row-level security policy")
--
-- So reads are open to the internet and the bucket is enumerable: walk
-- `vehicles/`, collect every vehicle id, download every photo. No writes,
-- which is the one piece of good news.
--
-- This replaces the permissive SELECT with one scoped to authenticated
-- members of the owning shop.
--
-- WHAT THIS DOES NOT DO
-- ---------------------
-- Stop anonymous reads of a URL someone already holds. While the bucket is
-- public, /object/public/ serves those directly. Only public = false (step 4)
-- closes that, and this policy is what governs reads once it does.
--
-- It SHOULD stop anonymous listing and signing as soon as it lands. That is
-- unverified: as of 2026-08-12 this migration has not successfully applied
-- (see the status note in Part 1), so nothing about it has been measured yet.
-- Do not describe its effect in either direction until the probe has been
-- re-run against a database where the function actually exists.
--
-- Note for whoever tests this: while the bucket is public, service-role and
-- anon signing both succeed today, so a passing signing test does NOT confirm
-- the policy is correct. The first genuine test of can_read_shop_asset() is
-- the moment the bucket goes private — exactly when an error in it locks
-- staff out of every photo. Treat that flip as a reversible experiment.
--
-- BLAST RADIUS
-- ------------
-- Low, deliberately. Today nothing in the app signs URLs — every read path
-- uses the stored public URL — so no app surface depends on the SELECT
-- permission being removed. The three customer-facing token pages
-- (/inspection, /status, /portal) already sign server-side with the service
-- role as of commit c6ca04b, and the service role bypasses RLS entirely, so
-- customer reports are unaffected.
--
-- Only SELECT is touched. INSERT/UPDATE/DELETE policies are left exactly as
-- they are — uploads keep working.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- PART 0 — INSPECTION. Run this first. Nothing here changes anything.
-- Report the output before running Part 1 or 2: Part 2 needs the real policy
-- name, and I will not guess it.
-- ---------------------------------------------------------------------------

-- 0a. Every existing policy on storage.objects. Look for SELECT policies whose
--     roles include anon or public — those are what grant the open read.
select
  policyname,
  cmd,
  roles,
  qual        as using_expression,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename  = 'objects'
order by cmd, policyname;

-- 0b. Confirm authenticated users can read shop_users, which the function
--     below joins through. If this is locked down, the function still works
--     (it is SECURITY DEFINER) — this is a sanity check, not a blocker.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'shop_users';


-- ---------------------------------------------------------------------------
-- PART 1 — the authorization function.
--
-- SECURITY DEFINER on purpose. A policy that inlines `exists (select 1 from
-- vehicles ...)` runs that subquery as the *calling* user, so RLS on vehicles
-- applies too — which invites recursion and makes the policy's behaviour
-- depend on unrelated policies. A definer function evaluates the ownership
-- question once, consistently, regardless of who is asking.
--
-- It answers exactly one question and returns a boolean. It leaks nothing:
-- callers can only learn whether they may read a path they already named.
-- ---------------------------------------------------------------------------

-- STATUS 2026-08-12: NOT APPLIED. A first attempt to run Parts 1 and 2
-- reported success, but `select proname from pg_proc where proname =
-- 'can_read_shop_asset'` returned no rows and "public read shop-assets" was
-- still present, so neither part took effect. Run Part 1 on its own and read
-- the result before assuming otherwise. Verify with the two queries at the
-- bottom of this file — never by whether the editor looked happy.

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
  -- Cast to text once, here. shop_id is not consistently typed across the
  -- schema — a first attempt failed with "operator does not exist: text =
  -- uuid" on appointments, so at least one table stores it as text while
  -- shop_users uses uuid. Comparing everything as text sidesteps the
  -- mismatch wherever it occurs instead of casting table by table and
  -- discovering the next one at runtime.
  mine as (
    select shop_id::text as shop_id from shop_users where user_id = auth.uid()
  )
  select case (select prefix from parts)

    -- Paths whose second segment IS the shop id.
    --   logo/{shopId}/shop-logo.ext
    --   parts/{shopId}/{partNumber}/{ts}.ext
    when 'logo'  then (select ident from parts) in (select shop_id from mine)
    when 'parts' then (select ident from parts) in (select shop_id from mine)

    -- Paths whose second segment is an entity id; resolve it to its shop.
    --   vehicles/{vehicleId}/{ts}.ext
    when 'vehicles' then exists (
      select 1 from vehicles v
      where v.id::text = (select ident from parts)
        and v.shop_id::text in (select shop_id from mine))

    --   inspections/{inspectionId}/{itemId}.ext
    when 'inspections' then exists (
      select 1 from inspections i
      where i.id::text = (select ident from parts)
        and i.shop_id::text in (select shop_id from mine))

    -- entity_images paths: `${entityType}s/${entityId}/...`
    when 'job_cards' then exists (
      select 1 from job_cards j
      where j.id::text = (select ident from parts)
        and j.shop_id::text in (select shop_id from mine))

    when 'repair_orders' then exists (
      select 1 from repair_orders r
      where r.id::text = (select ident from parts)
        and r.shop_id::text in (select shop_id from mine))

    when 'appointments' then exists (
      select 1 from appointments a
      where a.id::text = (select ident from parts)
        and a.shop_id::text in (select shop_id from mine))

    when 'parts_orders' then exists (
      select 1 from parts_orders p
      where p.id::text = (select ident from parts)
        and p.shop_id::text in (select shop_id from mine))

    when 'parts_estimates' then exists (
      select 1 from parts_estimates p
      where p.id::text = (select ident from parts)
        and p.shop_id::text in (select shop_id from mine))

    -- Deny by default. A new upload path added in application code without a
    -- matching branch here becomes unreadable rather than world-readable.
    -- That is the intended trade: a visible bug beats a silent hole. The eight
    -- prefixes above are every prefix present in the bucket on 2026-08-12
    -- (appointments has no objects yet and is included for when it does).
    else false
  end;
$$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default, so revoking
-- from anon alone would do nothing.
revoke execute on function public.can_read_shop_asset(text) from public;
grant  execute on function public.can_read_shop_asset(text) to authenticated;

comment on function public.can_read_shop_asset(text) is
  'True when the current user is a member of the shop owning this shop-assets object. Used by the storage.objects SELECT policy. Deny-by-default on unknown path prefixes.';


-- ---------------------------------------------------------------------------
-- PART 2 — swap the policy.
--
-- RUN THIS ONLY AFTER reporting Part 0a. The DROP below uses a placeholder
-- name; substitute the real permissive SELECT policy name(s) from 0a.
-- Dropping the wrong policy could remove upload or delete permission.
--
-- Order matters: create the new policy FIRST. Policies are OR'd, so with both
-- present access is unchanged; dropping the old one is the single moment the
-- restriction takes effect, and it is one statement to reverse.
-- ---------------------------------------------------------------------------

create policy "shop members read shop-assets"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'shop-assets'
  and public.can_read_shop_asset(name)
);

-- Part 0a returned exactly one SELECT policy, confirmed 2026-08-12:
--
--   policyname : public read shop-assets
--   cmd        : SELECT
--   roles      : {public}          <- every role, anon included
--   qual       : (bucket_id = 'shop-assets'::text)
--
-- No ownership test whatsoever: "is it in this bucket" was the entire
-- condition. That one line is what let an unauthenticated caller enumerate
-- the bucket. No other SELECT or ALL policy exists, so uploads (governed by
-- separate INSERT policies) are untouched by dropping it.
--
-- Note this also removes the blanket read that `authenticated` was getting
-- through {public} — which is the point. The new policy above replaces it
-- with the same access, scoped to the user's own shops.

drop policy "public read shop-assets" on storage.objects;


-- ---------------------------------------------------------------------------
-- VERIFY — after Part 2
-- ---------------------------------------------------------------------------

-- Should list the new policy and no SELECT policy granting anon/public.
select policyname, cmd, roles
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and cmd in ('SELECT', 'ALL')
order by policyname;

-- Then, outside SQL, re-run the probe. Expected after this migration:
--   anon list   -> denied
--   anon sign   -> denied
--   member sign -> allowed for own shop's objects
--   anon read of a known /object/public/ URL -> STILL ALLOWED until step 4.


-- ---------------------------------------------------------------------------
-- ROLLBACK — if staff report missing images
--
-- Exact, captured from Part 0a before the drop. Restores the previous
-- behaviour completely — including the open access, so treat this as a
-- break-glass step and say so if it is used.
--
--   drop policy "shop members read shop-assets" on storage.objects;
--
--   create policy "public read shop-assets"
--   on storage.objects for select to public
--   using (bucket_id = 'shop-assets'::text);
-- ---------------------------------------------------------------------------
