-- Record a deposit on a parts quotation.
--
-- Parts ORDERS already track this: deposit_paid and balance_due, with the
-- balance derived on every write (see partsOrderService.toRow). Quotations had
-- no equivalent, so a customer who paid up front against a quote had nowhere
-- to record it — and convertToOrder hardcoded depositPaid: 0, meaning the
-- deposit was lost at exactly the point it started to matter and the customer
-- was billed the full amount again.
--
-- Only the deposit is stored. Balance is always computed as
-- total_cost - deposit, never persisted, so the two cannot drift apart. That
-- mirrors what parts orders already do rather than inventing a second rule.
--
-- Safe: additive, defaulted, not null. Existing rows read 0, which is exactly
-- what they mean — no quotation before today could have carried a deposit.
-- Nothing is rewritten and no existing column changes type or nullability.

alter table public.parts_estimates
  add column if not exists deposit numeric not null default 0;

comment on column public.parts_estimates.deposit is
  'Amount paid up front against this quotation, in the quote''s currency. Balance due is derived (total_cost - deposit), never stored. Carried into parts_orders.deposit_paid on convert.';

-- Verify: expects one row, numeric, not null, default 0.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'parts_estimates'
  and column_name  = 'deposit';

-- Rollback:
--   alter table public.parts_estimates drop column deposit;
-- Dropping discards any deposits recorded after this ran, so check for
-- non-zero values first:
--   select count(*) from public.parts_estimates where deposit <> 0;
