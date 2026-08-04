-- Atomic document numbering.
--
-- Four services generated their own numbers by reading the table first:
--
--   repair_orders  COUNT(*) + 1        -> RO-00024
--   estimates      COUNT(*) + 1        -> EST-0007
--   invoices       MAX(number) + 1     -> INV-0028
--   inspections    MAX(number) + 1     -> DVI-0004
--
-- Read-then-write, with no lock between. Two orders started close together read
-- the same value and both wrote it. Production has RO-00024 on two vehicles and
-- RO-00003 on two more.
--
-- The COUNT variants fail a second way that needs no concurrency at all:
-- deleting any row lowers the count, so the next document reuses a number that
-- already exists. That reproduces on a single machine, every time.
--
-- Allocation moves here, where a row lock makes it atomic. UPDATE ... RETURNING
-- inside INSERT ... ON CONFLICT locks the counter row for the duration, so two
-- concurrent callers serialise and receive different values.

create table if not exists public.document_counters (
  shop_id    uuid        not null references public.shops(id) on delete cascade,
  doc_type   text        not null,
  last_value bigint      not null default 0,
  updated_at timestamptz not null default now(),
  primary key (shop_id, doc_type)
);

-- Seed from what each shop already issued, before anything can allocate.
-- Starting at zero would hand out numbers that are already on documents.
--
-- MAX, not COUNT: a shop that deleted an order has fewer rows than its highest
-- number, and seeding from the count would walk straight back over the gap.
-- Numbering is deliberately per shop — two tenants sharing RO-00001 is normal,
-- and the mirrored-shop reads that motivated the old cross-shop count are a
-- display concern, not a numbering one.
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

create or replace function public.next_document_number(p_shop_id uuid, p_doc_type text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v bigint;
begin
  -- SECURITY DEFINER bypasses RLS, so membership is checked explicitly.
  -- Without this any authenticated user could advance another shop's counter.
  if not exists (
    select 1 from public.shop_users
     where shop_id = p_shop_id and user_id = auth.uid()
  ) then
    raise exception 'not a member of shop %', p_shop_id using errcode = '42501';
  end if;

  if p_doc_type not in ('repair_order', 'estimate', 'invoice', 'inspection') then
    raise exception 'unknown document type %', p_doc_type using errcode = '22023';
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

alter table public.document_counters enable row level security;

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.document_counters'::regclass) then
    raise exception 'RLS did not enable on document_counters';
  end if;
end $$;

-- No policy is created deliberately. Every read and write goes through
-- next_document_number, which runs as definer. With RLS on and no policy,
-- direct access returns nothing and changes nothing — a client cannot rewind a
-- counter to reissue a number that is already on a document.
revoke all on public.document_counters from authenticated, anon;
grant execute on function public.next_document_number(uuid, text) to authenticated;
revoke execute on function public.next_document_number(uuid, text) from anon;
