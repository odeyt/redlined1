-- Standing invoice terms per shop (e.g. a vehicle pickup deadline).
--
-- RUN THIS AGAINST redlined1 — check the project selector reads `redlined1`,
-- not `d1express-dev`. Run it on its own: the SQL editor executes a tab as one
-- transaction, and a failure anywhere rolls back everything in it.
--
-- Free text set in Settings → Invoice Terms and printed in its own box under
-- the notes on every invoice, e.g.
--   "Vehicles must be collected within 7 days of repair completion."
--
-- Safe: additive, nullable, no default. Null means no terms box is printed,
-- which is exactly what every existing shop has today. The app reads this
-- column in its own query and treats a missing column as "no terms", so the
-- code can ship before or after this runs.

alter table public.shop_settings
  add column if not exists invoice_terms text;

comment on column public.shop_settings.invoice_terms is
  'Standing terms printed on every invoice under the notes (e.g. vehicle pickup deadline). Null = none. Set in Settings.';

-- Verify: expects one row — text, nullable.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'shop_settings'
  and column_name  = 'invoice_terms';

-- PostgREST caches the schema and rejects writes naming a column it has not
-- seen yet (PGRST204), for a minute or two after DDL. This asks it to reload
-- now rather than waiting.
notify pgrst, 'reload schema';

-- Rollback:
--   alter table public.shop_settings drop column invoice_terms;
-- Invoices then print without a terms box. Check what would be lost:
--   select shop_id, invoice_terms from public.shop_settings
--   where invoice_terms is not null;
