-- next_document_number must not depend on the seed having run.
--
-- As first written, a missing counter row made the function insert last_value=1
-- and hand out number 1 — which, at a shop with 28 invoices, is a number that
-- already exists. The seed in the previous migration covered 3 of the 9 rows
-- the data needs, so this was not hypothetical.
--
-- The counter is now derived from the source table the first time a shop asks
-- for a type. The seed becomes an optimisation; correctness no longer rests on
-- it, and a counter deleted later repairs itself rather than restarting at 1.

create or replace function public.next_document_number(p_shop_id uuid, p_doc_type text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v      bigint;
  v_seed bigint;
begin
  -- SECURITY DEFINER bypasses RLS, so membership is checked explicitly.
  if not exists (
    select 1 from public.shop_users
     where shop_id = p_shop_id and user_id = auth.uid()
  ) then
    raise exception 'not a member of shop %', p_shop_id using errcode = '42501';
  end if;

  if p_doc_type not in ('repair_order', 'estimate', 'invoice', 'inspection') then
    raise exception 'unknown document type %', p_doc_type using errcode = '22023';
  end if;

  -- Establish the starting point from what the shop has already issued.
  -- MAX, not COUNT: a deleted document must not let the number be reused.
  if not exists (
    select 1 from public.document_counters
     where shop_id = p_shop_id and doc_type = p_doc_type
  ) then
    v_seed := case p_doc_type
      when 'repair_order' then (
        select coalesce(max(nullif(regexp_replace(ro_number, '\D', '', 'g'), '')::bigint), 0)
          from public.repair_orders where shop_id = p_shop_id)
      when 'estimate' then (
        select coalesce(max(nullif(regexp_replace(estimate_number, '\D', '', 'g'), '')::bigint), 0)
          from public.estimates where shop_id = p_shop_id)
      when 'invoice' then (
        select coalesce(max(nullif(regexp_replace(number, '\D', '', 'g'), '')::bigint), 0)
          from public.invoices where shop_id = p_shop_id)
      when 'inspection' then (
        select coalesce(max(nullif(regexp_replace(inspection_number, '\D', '', 'g'), '')::bigint), 0)
          from public.inspections where shop_id = p_shop_id)
    end;

    -- DO NOTHING, not DO UPDATE: if another caller seeded first, its value
    -- stands. Two callers writing a seed would be two callers rewinding it.
    insert into public.document_counters (shop_id, doc_type, last_value)
    values (p_shop_id, p_doc_type, coalesce(v_seed, 0))
    on conflict (shop_id, doc_type) do nothing;
  end if;

  -- The row lock taken by ON CONFLICT DO UPDATE is what makes this atomic.
  insert into public.document_counters (shop_id, doc_type, last_value)
  values (p_shop_id, p_doc_type, 1)
  on conflict (shop_id, doc_type) do update
     set last_value = public.document_counters.last_value + 1,
         updated_at = now()
  returning last_value into v;

  return v;
end
$$;

-- Backfill the rows the first seed missed. Correctness no longer depends on
-- this, but it keeps the first allocation cheap and makes the state readable.
insert into public.document_counters (shop_id, doc_type, last_value)
select shop_id, 'repair_order',
       coalesce(max(nullif(regexp_replace(ro_number, '\D', '', 'g'), '')::bigint), 0)
  from public.repair_orders where shop_id is not null group by shop_id
on conflict (shop_id, doc_type) do nothing;

insert into public.document_counters (shop_id, doc_type, last_value)
select shop_id, 'estimate',
       coalesce(max(nullif(regexp_replace(estimate_number, '\D', '', 'g'), '')::bigint), 0)
  from public.estimates where shop_id is not null group by shop_id
on conflict (shop_id, doc_type) do nothing;

insert into public.document_counters (shop_id, doc_type, last_value)
select shop_id, 'invoice',
       coalesce(max(nullif(regexp_replace(number, '\D', '', 'g'), '')::bigint), 0)
  from public.invoices where shop_id is not null group by shop_id
on conflict (shop_id, doc_type) do nothing;

insert into public.document_counters (shop_id, doc_type, last_value)
select shop_id, 'inspection',
       coalesce(max(nullif(regexp_replace(inspection_number, '\D', '', 'g'), '')::bigint), 0)
  from public.inspections where shop_id is not null group by shop_id
on conflict (shop_id, doc_type) do nothing;

-- PUBLIC, not just anon. Postgres grants EXECUTE to PUBLIC on every new
-- function, so revoking from anon alone leaves the function callable — anon
-- reaches the body and is stopped only by the membership check. That check is
-- the real defence, but it should not be the only one.
revoke execute on function public.next_document_number(uuid, text) from public;
revoke execute on function public.next_document_number(uuid, text) from anon;
grant  execute on function public.next_document_number(uuid, text) to authenticated;

notify pgrst, 'reload schema';
