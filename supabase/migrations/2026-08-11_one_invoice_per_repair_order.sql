-- One repair order, at most one invoice — enforced by the database.
--
-- Verified by probe on 2026-08-11: two invoices with different numbers, both
-- naming the same repair order, were BOTH accepted. invoices.number is the
-- primary key, so two invoices can never share a number — but nothing stopped
-- one job being billed twice under two numbers.
--
-- The only guard was client-side, in handleConvertToInvoice:
--
--   if (ro.invoiceNumber) { setError('already invoiced'); return; }
--
-- That reads state the browser loaded. Two tabs that both opened the order
-- before either converted each believe it is unbilled, so both pass, both
-- allocate a number, and both insert. The primary key does not help: the
-- numbers differ. Two advisors working the same order is not an exotic case in
-- a two-location shop.
--
-- invoices had no reference to a repair order at all — only job_card and the
-- free text in notes — so the column is added here. It is nullable because
-- most invoices are not conversions: estimates and parts quotations also
-- produce invoices, and those legitimately have no repair order.
--
-- Checked before writing this: no repair order currently has two invoices, so
-- the index applies cleanly to existing data.

alter table public.invoices
  add column if not exists repair_order_id uuid references public.repair_orders(id) on delete set null;

comment on column public.invoices.repair_order_id is
  'The repair order this invoice was raised from, when it was. Unique: a repair order can be billed once.';

-- Conservative backfill: only where the note names exactly one repair order in
-- the same shop. Guessing a link would be worse than leaving it null — a wrong
-- link would block a legitimate future conversion.
update public.invoices i
   set repair_order_id = r.id
  from public.repair_orders r
 where i.repair_order_id is null
   and r.shop_id = i.shop_id
   and i.notes like 'Converted from ' || r.ro_number || '%'
   and (select count(*) from public.repair_orders r2
         where r2.shop_id = i.shop_id
           and i.notes like 'Converted from ' || r2.ro_number || '%') = 1;

-- Partial, so the many invoices with no repair order do not collide on null.
-- repair_orders.id is a uuid primary key, so this needs no shop_id: the id is
-- already unique across every tenant.
create unique index if not exists invoices_one_per_repair_order
  on public.invoices (repair_order_id)
  where repair_order_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'invoices_one_per_repair_order'
  ) then
    raise exception 'invoices_one_per_repair_order was not created';
  end if;
end $$;

notify pgrst, 'reload schema';
