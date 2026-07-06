# Test Data Cleanup

All test records created by Playwright use the prefix `[TEST]` in their name/title fields.
This makes them easy to identify and bulk-delete.

## Cleanup SQL (staging only — NEVER run on production)

Run this in your Supabase SQL editor for the **staging** project:

```sql
-- Identify test records first
SELECT 'customers' as table_name, count(*) FROM customers WHERE name ILIKE '[TEST]%'
UNION ALL
SELECT 'vehicles',  count(*) FROM vehicles  WHERE model ILIKE '[TEST]%'
UNION ALL
SELECT 'job_cards', count(*) FROM job_cards WHERE complaint ILIKE '[TEST]%'
UNION ALL
SELECT 'estimates', count(*) FROM estimates WHERE notes ILIKE '[TEST]%';

-- Delete after review
DELETE FROM customers WHERE name      ILIKE '[TEST]%';
DELETE FROM vehicles  WHERE model     ILIKE '[TEST]%';
DELETE FROM job_cards WHERE complaint ILIKE '[TEST]%';
DELETE FROM estimates WHERE notes     ILIKE '[TEST]%';
```

## Nightly cleanup (recommended)

Set up a Supabase Edge Function or pg_cron job to run the DELETE statements
nightly on the staging database. This keeps test data from accumulating across
repeated CI runs.

## Auth files

`tests/.auth/owner.json` contains session cookies and is gitignored.
It is regenerated each time the auth setup project runs.
Delete it manually if credentials change:
```bash
rm tests/.auth/owner.json
```
