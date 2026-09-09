-- The currency a parts ORDER's deposit was actually handed over in.
--
-- The exact counterpart of 2026-08-12_parts_estimates_deposit_currency.sql,
-- which gave quotations this a month ago. Orders were left storing
-- deposit_paid with no currency beside it, so the figure is read as the
-- order's currency by everything that touches it.
--
-- Reported with a screenshot on 2026-09-09: a headlight priced at THB 900 with
-- 380,000 kip put down. Read as THB 380,000 — four hundred times the quote —
-- and the balance due showed zero, because a deposit larger than the total
-- clamps to nothing. Nothing on the screen said the money had arrived in a
-- different currency, because there was nowhere to say it.
--
-- Between LAK and THB the error is roughly 700x. That is not a rounding
-- problem, it is a sheet that says a customer has paid when they have not.
--
-- The amount is stored exactly as handed over and never converted on the way
-- in. Conversion happens for display, at today's rate. Storing the converted
-- value would bake in whatever the rate was that day with no record of the
-- cash actually received.
--
-- Safe: additive, defaulted from the row's own currency, so every deposit
-- already recorded keeps the meaning it already had. No existing column
-- changes and no data is removed.

alter table public.parts_orders
  add column if not exists deposit_currency text;

-- Backfill: every deposit recorded before this column existed was entered in
-- the order's currency, because that is the only thing the UI offered — the
-- field was literally labelled "Deposit Paid (<currency>)".
update public.parts_orders
set deposit_currency = currency
where deposit_currency is null;

comment on column public.parts_orders.deposit_currency is
  'ISO 4217 code the deposit was paid in, which may differ from the order currency. deposit_paid is the amount as handed over, never converted; balance_due is converted at display time.';

-- Verify: expects 1 and 0.
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'parts_orders'
       and column_name = 'deposit_currency')                        as column_exists_expect_1,
  (select count(*) from public.parts_orders
     where deposit_currency is null)                                as nulls_remaining_expect_0;

-- Rollback:
--   alter table public.parts_orders drop column deposit_currency;
-- Deposits then read as if they were in the order's currency again, which is
-- wrong for any recorded in another. Check what would be lost first:
--   select count(*) from public.parts_orders
--   where deposit_paid > 0 and deposit_currency is distinct from currency;
