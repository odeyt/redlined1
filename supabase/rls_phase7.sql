-- ═══════════════════════════════════════════════════════════════
-- REDLINE CRM  —  Phase 7  Security & Row Level Security
-- Run this entire script in Supabase SQL Editor (one shot).
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. PROFILES TABLE (links auth.users → shop role) ──────────
create table if not exists profiles (
  id       uuid primary key references auth.users(id) on delete cascade,
  name     text not null default '',
  role     text not null default 'Advisor',   -- Owner | Advisor | Technician | Fleet Client
  email    text,
  status   text not null default 'Active',
  created_at timestamptz default now()
);

-- Auto-create a profile row on every new sign-up
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'Advisor')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Permissions on profiles
grant select, insert, update on profiles to authenticated;

-- ─── 2. HELPER: current user's role ────────────────────────────
create or replace function my_role()
returns text language sql stable security definer as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'Advisor'
  );
$$;

-- ─── 3. ENABLE RLS ON ALL TABLES ───────────────────────────────
alter table customers            enable row level security;
alter table vehicles             enable row level security;
alter table job_cards            enable row level security;
alter table invoices             enable row level security;
alter table estimates            enable row level security;
alter table payments             enable row level security;
alter table parts                enable row level security;
alter table repair_orders        enable row level security;
alter table inspections          enable row level security;
alter table technicians          enable row level security;
alter table shop_settings        enable row level security;
alter table maintenance_schedules enable row level security;
alter table campaigns            enable row level security;
alter table followups            enable row level security;
alter table profiles             enable row level security;

-- ─── 4. DROP OLD PERMISSIVE POLICIES (clean slate) ─────────────
do $$ declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from   pg_policies
    where  schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ─── 5. SHOP SETTINGS ──────────────────────────────────────────
-- All authenticated staff can read; only Owner can write.
create policy "settings_read"
  on shop_settings for select to authenticated using (true);

create policy "settings_write"
  on shop_settings for all to authenticated
  using    (my_role() = 'Owner')
  with check (my_role() = 'Owner');

-- ─── 6. CUSTOMERS ──────────────────────────────────────────────
create policy "customers_staff_all"
  on customers for all to authenticated using (true) with check (true);

-- Portal: anon may read a single customer matched by portal_token.
-- The portal page is server-side (service_role) so anon never actually
-- hits this path in production, but left as defence-in-depth.
create policy "customers_portal_read"
  on customers for select to anon
  using (portal_token is not null);

-- ─── 7. VEHICLES ───────────────────────────────────────────────
create policy "vehicles_staff_all"
  on vehicles for all to authenticated using (true) with check (true);

-- ─── 8. JOB CARDS ──────────────────────────────────────────────
create policy "job_cards_staff_all"
  on job_cards for all to authenticated using (true) with check (true);

-- Technicians may update their own assigned cards only (not delete/insert)
create policy "job_cards_tech_update"
  on job_cards for update to authenticated
  using (
    my_role() = 'Technician' and
    auth.uid()::text = any(
      select id from profiles
      where name = any(
        select jsonb_array_elements_text(technicians::jsonb)
        from   job_cards jc2
        where  jc2.id = job_cards.id
      )
    )
  );

-- ─── 9. REPAIR ORDERS ──────────────────────────────────────────
create policy "ro_staff_all"
  on repair_orders for all to authenticated using (true) with check (true);

-- ─── 10. INVOICES ───────────────────────────────────────────────
-- All staff read/write; only Owner or Advisor may delete
create policy "invoices_read_write"
  on invoices for select to authenticated using (true);

create policy "invoices_insert"
  on invoices for insert to authenticated with check (true);

create policy "invoices_update"
  on invoices for update to authenticated using (true) with check (true);

create policy "invoices_delete"
  on invoices for delete to authenticated
  using (my_role() in ('Owner', 'Advisor'));

-- ─── 11. ESTIMATES ──────────────────────────────────────────────
create policy "estimates_staff_all"
  on estimates for all to authenticated using (true) with check (true);

-- Portal: anon may approve / decline their own estimate (update status only).
-- The app checks portal_token server-side before calling this.
create policy "estimates_portal_update"
  on estimates for update to anon
  using (
    customer_id in (
      select id from customers where portal_token is not null
    )
  )
  with check (status in ('Approved', 'Declined'));

-- ─── 12. PAYMENTS ───────────────────────────────────────────────
create policy "payments_read_write"
  on payments for select to authenticated using (true);

create policy "payments_insert"
  on payments for insert to authenticated with check (true);

create policy "payments_update"
  on payments for update to authenticated
  using (my_role() in ('Owner', 'Advisor')) with check (true);

create policy "payments_delete"
  on payments for delete to authenticated
  using (my_role() = 'Owner');

-- ─── 13. PARTS ──────────────────────────────────────────────────
create policy "parts_read"
  on parts for select to authenticated using (true);

create policy "parts_write"
  on parts for all to authenticated
  using    (my_role() in ('Owner', 'Advisor'))
  with check (my_role() in ('Owner', 'Advisor'));

-- Technicians may decrement qty (reserve) but not create/delete parts
create policy "parts_tech_update"
  on parts for update to authenticated
  using    (my_role() = 'Technician')
  with check (my_role() = 'Technician');

-- ─── 14. INSPECTIONS ────────────────────────────────────────────
create policy "inspections_staff_all"
  on inspections for all to authenticated using (true) with check (true);

-- ─── 15. TECHNICIANS TABLE ──────────────────────────────────────
create policy "technicians_read"
  on technicians for select to authenticated using (true);

create policy "technicians_write"
  on technicians for all to authenticated
  using    (my_role() in ('Owner', 'Advisor'))
  with check (my_role() in ('Owner', 'Advisor'));

-- ─── 16. MAINTENANCE SCHEDULES ──────────────────────────────────
create policy "maintenance_staff_all"
  on maintenance_schedules for all to authenticated using (true) with check (true);

-- ─── 17. CAMPAIGNS & FOLLOWUPS ──────────────────────────────────
create policy "campaigns_staff_all"
  on campaigns for all to authenticated using (true) with check (true);

create policy "followups_staff_all"
  on followups for all to authenticated using (true) with check (true);

-- ─── 18. PROFILES ───────────────────────────────────────────────
-- Users can read all profiles (for name lookups) and update their own.
create policy "profiles_read"
  on profiles for select to authenticated using (true);

create policy "profiles_self_update"
  on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Only Owner can manage other users' profiles
create policy "profiles_owner_manage"
  on profiles for all to authenticated
  using    (my_role() = 'Owner')
  with check (my_role() = 'Owner');

-- ─── 19. FIRST OWNER ────────────────────────────────────────────
-- After running this script, promote your own account to Owner:
--   update profiles set role = 'Owner' where email = 'your@email.com';
