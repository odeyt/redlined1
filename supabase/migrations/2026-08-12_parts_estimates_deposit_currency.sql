-- The currency a deposit was actually handed over in.
--
-- Follows 2026-08-12_parts_estimates_deposit.sql, which stored the amount but
-- assumed it was in the quote's currency. It often is not: a Lao customer pays
-- 600,000 LAK against a quote priced in THB because that is the cash in hand.
-- Storing 600000 with no currency beside it makes the figure unreadable — and
-- worse, usable, since anything reading it will assume the quote's currency
-- and understate the balance by roughly 25x.
--
-- The amount is stored exactly as entered and never converted on the way in.
-- Conversion happens for display, and once more when the quote becomes an
-- order (which records a single deposit figure in its own currency). Storing
-- the converted value instead would bake in whatever the rate happened to be
-- on the day, with no record of what the customer actually handed over.
--
-- Safe: additive, defaulted from the row's own currency, so existing deposits
-- keep the meaning they already had. No existing column changes.

alter table public.parts_estimates
  add column if not exists deposit_currency text;

-- Backfill: every deposit recorded before this column existed was entered in
-- the quote's currency, because that was the only option the UI offered.
update public.parts_estimates
set deposit_currency = currency
where deposit_currency is null;

comment on column public.parts_estimates.deposit_currency is
  'ISO 4217 code the deposit was paid in, which may differ from the quote currency. The deposit column is the amount as handed over, never converted. Balance and parts_orders.deposit_paid are converted at display/convert time.';

-- Verify: expects one row, text, and no NULLs left behind.
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'parts_estimates'
       and column_name = 'deposit_currency')                        as column_exists,
  (select count(*) from public.parts_estimates
     where deposit_currency is null)                                as nulls_remaining;

-- Rollback:
--   alter table public.parts_estimates drop column deposit_currency;
-- Deposits then read as if they were in the quote's currency again, which is
-- wrong for any recorded in another. Check first:
--   select count(*) from public.parts_estimates
--   where deposit > 0 and deposit_currency is distinct from currency;
