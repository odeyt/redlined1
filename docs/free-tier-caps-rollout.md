# Free Forever caps — validation and rollout

Migration: `supabase/migrations/2026-09-30_free_tier_caps_race_safe.sql`
Local test: `npm run test:db:free-tier`

## What this is

The Free Forever plan promises 10 customers, 10 vehicles and 5 jobs per calendar
month. `supabase/migrations/free_tier_usage_limits.sql` was written to enforce
that but was never applied: on both production (`ldjrlvjkmzrcdqhetqoh`) and
staging (`kfwxmfvlfdurvjruadtc`) `public.enforce_free_tier_count_limit()` and its
triggers were found missing. **Nothing enforces the caps today.** This migration
installs the function and the three `BEFORE INSERT` triggers, race-safe, and
supersedes the original file. Do not run the original afterwards.

## Behaviour

| | |
|---|---|
| Limits | 10 customers, 10 vehicles, 5 job cards per calendar month, per shop |
| Who is limited | shops whose **owner** (`shop_users.role = 'owner'`) has `profiles.plan = 'free'` |
| Not limited | paid plans; shops with no owner row; an owner with no profile row (established behaviour, kept, not an entitlement change) |
| Error | `FREE_TIER_LIMIT:<table>:<limit>` (P0001), rendered by `lib/freeTierLimit.ts` |
| Checked on | `INSERT` only |

### Things to know (found while reviewing; none silently changed)

1. **`job_cards.check_in_date` is caller-supplied.** `services/jobCardService.ts`
   inserts `fields.checkInDate || new Date()`, so a client can backdate a job
   out of the current month and escape the count, and a future-dated job counts
   against this month. The cap also ignores the new row's own date.
2. **Month boundary uses the database time zone** (`date_trunc('month', now())`,
   UTC on Supabase), not Laos time (UTC+7): between 00:00 and 07:00 Laos time on
   the 1st, the previous month's jobs still count.
3. **The column type of `check_in_date` on the real schema is unverified**
   (the app reads it as a string). The staging check below confirms it is a
   timestamp type before the migration is trusted for job cards.
4. **`plan = 'free'` with a still-running `trial_ends_at`** (the transient row
   the signup trigger writes; `lib/usePlan.ts` treats it as a trial) **is capped**,
   as the original design did. If a trialing new signup must not be capped, that
   is a separate decision.
5. **Existing free shops already above a cap** keep every row and can edit them;
   they simply cannot insert more until under the cap (or upgraded). Nothing is
   deleted or blocked retroactively. A shop with 12 customers stays at 12.
6. The same `owner` lookup applies to the mirrored second location: the cap is
   evaluated per `shop_id`, so each of the two D1 shops is counted separately
   (their owners are not `free` anyway — see the preflight).

## Preflight (read-only) — run on staging, then production

```sql
-- 1. Function and triggers: expect fn = 0 and no rows before the migration.
SELECT count(*) AS fn FROM pg_proc
WHERE pronamespace = 'public'::regnamespace AND proname = 'enforce_free_tier_count_limit';

SELECT c.relname, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS def
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('customers','vehicles','job_cards') AND NOT t.tgisinternal;

-- 2. Column types.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'job_cards' AND column_name IN ('shop_id','check_in_date'))
    OR (table_name IN ('customers','vehicles') AND column_name = 'shop_id')
    OR (table_name = 'profiles' AND column_name IN ('id','plan'))
    OR (table_name = 'shop_users' AND column_name IN ('shop_id','user_id','role')))
ORDER BY 1, 2;

-- 3. Plan values in use (counts only).
SELECT plan, count(*) FROM public.profiles GROUP BY plan ORDER BY 2 DESC;

-- 4. Who would be affected: free-owner shops already at or over a cap (counts only).
WITH free_shops AS (
  SELECT DISTINCT su.shop_id
  FROM public.shop_users su JOIN public.profiles p ON p.id = su.user_id
  WHERE su.role = 'owner' AND p.plan = 'free'
)
SELECT
  (SELECT count(*) FROM free_shops) AS free_shops,
  (SELECT count(*) FROM free_shops f WHERE (SELECT count(*) FROM public.customers c WHERE c.shop_id = f.shop_id) >= 10) AS customers_at_or_over,
  (SELECT count(*) FROM free_shops f WHERE (SELECT count(*) FROM public.vehicles v WHERE v.shop_id = f.shop_id) >= 10) AS vehicles_at_or_over,
  (SELECT count(*) FROM free_shops f WHERE (SELECT count(*) FROM public.job_cards j WHERE j.shop_id = f.shop_id AND j.check_in_date >= date_trunc('month', now())) >= 5) AS jobs_at_or_over_this_month;

-- 5. Confirm the two D1 shops are NOT free-owned (they must never be limited).
SELECT su.shop_id, p.plan
FROM public.shop_users su JOIN public.profiles p ON p.id = su.user_id
WHERE su.role = 'owner'
  AND su.shop_id IN ('38d55fae-741b-4bac-b520-f96eed65bf38','90b72748-bf01-4456-999f-f4ba48091606');

-- 6. Any other trigger on these tables that sends anything outbound (inspect by eye).
SELECT c.relname, t.tgname, p.proname
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('customers','vehicles','job_cards') AND NOT t.tgisinternal;
```

**Stop and report** if query 1 finds any function or trigger already present, if
the D1 shops resolve to `free` in query 5, or if `check_in_date` is not a
`timestamp`/`timestamptz`. The migration itself also refuses to run on a
conflicting trigger or a missing column, changing nothing.

## Staging validation (real schema) — pending

Staging already exists: `kfwxmfvlfdurvjruadtc` (production is
`ldjrlvjkmzrcdqhetqoh`). Real-schema validation is **pending**: it was not run
from the machine that prepared this migration because database access is
unavailable there. Whoever runs it supplies their own credentials (never pasted
into chat or files). Only the local Docker results (`npm run test:db:free-tier`,
stub tables) exist so far; they do not prove compatibility with the real schema.

1. Run the preflight above; save the output.
2. Save `pg_get_triggerdef` output for every existing trigger on the three
   tables (query 1 and 6) for the before/after record.
3. Apply the migration file as-is in the SQL editor. Expect the notice
   `free-tier caps: acceptance checks passed`.
4. Re-run query 1: expect one function and three `trg_free_tier_limit` triggers,
   plus the unchanged unrelated triggers.
5. Concurrency test with synthetic tenants only (disposable `auth.users`,
   `shops`, `shop_users`, `profiles(plan='free')` rows, marked `zz-captest`),
   using separate sessions (a single transaction is not a concurrency test):
   open N sessions that each `BEGIN; INSERT …; SELECT pg_sleep(3); COMMIT;` for
   one shop, then count committed rows: expect exactly 10 / 10 / 5. Confirm each
   test owner resolves as intended. Do not touch the two pre-existing staging
   accounts or any other data; delete only the `zz-captest` fixtures afterwards.
6. Record the after-state definitions and the counts.

## Rollback (restores the observed state: no function, no triggers)

```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_free_tier_limit ON public.customers;
DROP TRIGGER IF EXISTS trg_free_tier_limit ON public.vehicles;
DROP TRIGGER IF EXISTS trg_free_tier_limit ON public.job_cards;
DROP FUNCTION IF EXISTS public.enforce_free_tier_count_limit();
COMMIT;
```

This deletes no rows. If the preflight ever finds a different prior state, save
that definition (`pg_get_functiondef`, `pg_get_triggerdef`) first and restore it
instead.

## Production

Production is `ldjrlvjkmzrcdqhetqoh`. Awaiting explicit approval; requires:
staging results above, the production preflight with no stop conditions, and a
decision on the effect below.

**Effect:** turning enforcement on for the first time. Free shops start being
refused at 10 customers / 10 vehicles / 5 jobs this month. Shops already above a
cap keep their data but cannot add more, and staff there will see the upgrade
prompt from `lib/freeTierLimit.ts` on their next add. Preflight query 4 gives the
number of shops affected. This is a product-behaviour change, not only a fix.

**Security hold:** the project memory records an open production hold (pg_net
grants on 19/12 objects, and a push secret not rotated as of 2026-09-24). This
migration does not touch pg_net, secrets or grants on any other object, and it
revokes rather than adds EXECUTE. It does not depend on the hold being cleared,
but the hold's own rule (no production demo work until cleared) is separate; the
owner decides whether any production DB change should wait.
