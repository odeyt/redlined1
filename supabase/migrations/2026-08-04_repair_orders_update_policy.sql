-- repair_orders had no UPDATE policy.
--
-- RLS denies by default, so with SELECT permitted and UPDATE absent, every
-- edit matched zero rows. PostgREST reports no error for that, and the service
-- checked only for an error, so the app reported success and wrote nothing.
--
-- Confirmed in production: RO-00019 taken through QA sign-off did not change,
-- and ro_status_events — trigger attached and working — held zero rows, so no
-- status update has succeeded since that trigger was created. The 19 orders
-- sitting Complete predate the policies as they now stand.
--
-- USING decides which rows may be updated; WITH CHECK decides what they may
-- become. Both are needed: USING alone would let a member move an order into
-- another shop by rewriting shop_id, since nothing would validate the new row.

create policy repair_orders_update
  on public.repair_orders
  for update
  to authenticated
  using (
    shop_id in (select shop_id from public.shop_users where user_id = auth.uid())
  )
  with check (
    shop_id in (select shop_id from public.shop_users where user_id = auth.uid())
  );

do $$
begin
  if not exists (
    select 1 from pg_policy
     where polrelid = 'public.repair_orders'::regclass
       and polcmd in ('w', '*')
  ) then
    raise exception 'repair_orders still has no UPDATE policy';
  end if;
end $$;
