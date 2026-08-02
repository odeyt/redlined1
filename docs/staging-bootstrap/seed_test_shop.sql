-- Run this AFTER the schema clone + the 00-10 remediation files, against
-- STAGING only. Creates one synthetic shop and links a test user to it as
-- owner. No real customer/production data — safe by design.
--
-- Step 1: In the Supabase dashboard (staging project) → Authentication →
--         Users → Add User. Create a test login (email + password you
--         choose). Copy the generated User UID shown in the users list.
-- Step 2: Paste that UID below in place of <TEST_USER_ID>, then run this
--         whole file in the staging SQL Editor.

-- 1. Create the test shop
insert into public.shops (name, slug)
values ('D1 Staging Test Shop', 'd1-staging-test-shop')
on conflict (slug) do nothing;

-- 2. Link the test user as owner of that shop
insert into public.shop_users (shop_id, user_id, role)
select id, '<TEST_USER_ID>'::uuid, 'owner'
from public.shops
where slug = 'd1-staging-test-shop'
on conflict (shop_id, user_id) do update set role = excluded.role;

-- 3. Grant the Free Forever plan so the account isn't stuck mid-signup
--    (best-effort — skips quietly if this column doesn't exist on your
--    current schema rather than erroring the whole script).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'plan'
  ) then
    update public.profiles set plan = 'free' where id = '<TEST_USER_ID>'::uuid;
  end if;
end $$;

-- 4. Confirm — should return exactly one row: your test shop + role 'owner'
select s.id as shop_id, s.name, su.role
from public.shop_users su
join public.shops s on s.id = su.shop_id
where su.user_id = '<TEST_USER_ID>'::uuid;
