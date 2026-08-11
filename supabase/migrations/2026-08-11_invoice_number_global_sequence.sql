-- Invoice numbers are global; the per-shop counter was about to collide.
--
-- invoices.number is that table's PRIMARY KEY, so it is unique across every
-- shop. next_document_number, added on 2026-08-04, allocates per shop — which
-- works for repair orders, estimates and inspections, whose numbers are only
-- unique within a shop, and is wrong for invoices.
--
-- Measured against production on 2026-08-11:
--
--   Location 2 (90b72748)  highest INV-0037   counter 37
--   D1 Imports (38d55fae)  highest INV-0036   counter 36
--
-- D1 Imports' next allocation was INV-0037, already used by Location 2. The
-- next invoice raised at that shop would have failed with
-- "duplicate key value violates unique constraint invoices_pkey" — not a
-- theoretical race, the very next one.
--
-- A Postgres sequence is the right shape for a globally unique counter: nextval
-- is atomic without a row lock, and it cannot hand the same value to two
-- callers. Numbers now interleave between locations, which is what the primary
-- key has always implied and what the previous client-side MAX() effectively
-- produced for an owner who could see both shops.
--
-- Starts at 38: the highest existing invoice is INV-0037, verified across all
-- 32 rows, all of which use the INV-#### format.
--
-- Per-shop numbering for invoices would need the primary key changed to
-- (shop_id, number). That is a larger, riskier migration and a separate
-- decision; this removes an imminent failure without touching any schema that
-- holds data.

create sequence if not exists invoice_number_seq start with 38;

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

  -- Global, because the number is the invoices primary key.
  if p_doc_type = 'invoice' then
    return nextval('invoice_number_seq');
  end if;

  -- Everything else stays per shop: two tenants may both hold RO-00001.
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
      when 'inspection' then (
        select coalesce(max(nullif(regexp_replace(inspection_number, '\D', '', 'g'), '')::bigint), 0)
          from public.inspections where shop_id = p_shop_id)
    end;

    insert into public.document_counters (shop_id, doc_type, last_value)
    values (p_shop_id, p_doc_type, coalesce(v_seed, 0))
    on conflict (shop_id, doc_type) do nothing;
  end if;

  insert into public.document_counters (shop_id, doc_type, last_value)
  values (p_shop_id, p_doc_type, 1)
  on conflict (shop_id, doc_type) do update
     set last_value = public.document_counters.last_value + 1,
         updated_at = now()
  returning last_value into v;

  return v;
end
$$;

revoke execute on function public.next_document_number(uuid, text) from public;
revoke execute on function public.next_document_number(uuid, text) from anon;
grant  execute on function public.next_document_number(uuid, text) to authenticated;

notify pgrst, 'reload schema';
