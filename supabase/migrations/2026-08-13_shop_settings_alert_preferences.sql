-- Per-role alert preferences.
--
-- RUN THIS AGAINST redlined1 — check the project selector reads `redlined1`,
-- not `d1express-dev`. Run it on its own: the SQL editor executes a tab as one
-- transaction, and a failure anywhere rolls back everything in it.
--
-- Stores the DISABLED alert ids per role, e.g.
--   {"technician": ["invoice.paid"], "advisor": []}
--
-- Disabled rather than enabled, so "everything on by default" keeps holding
-- for alerts added later: a new event is absent from every stored list, so it
-- switches on for every shop without migrating anyone's settings. Storing the
-- enabled ids would leave new alerts silently off for existing shops — the
-- opposite of what was asked for.
--
-- Safe: additive, nullable, no default. An absent or empty value means every
-- alert is on, which is exactly what every existing shop should get.

alter table public.shop_settings
  add column if not exists alert_preferences jsonb;

comment on column public.shop_settings.alert_preferences is
  'Per-role DISABLED alert ids, keyed by role (owner|manager|advisor|technician). Absent role or absent id means the alert is enabled. Event ids are defined in lib/alerts/catalogue.ts.';

-- Verify: expects one row — jsonb, nullable.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'shop_settings'
  and column_name  = 'alert_preferences';

-- PostgREST caches the schema and rejects writes naming a column it has not
-- seen yet (PGRST204), for a minute or two after DDL. This asks it to reload
-- now rather than waiting.
notify pgrst, 'reload schema';

-- Rollback:
--   alter table public.shop_settings drop column alert_preferences;
-- Every shop then reverts to all alerts enabled. Check what would be lost:
--   select shop_id, alert_preferences from public.shop_settings
--   where alert_preferences is not null;
