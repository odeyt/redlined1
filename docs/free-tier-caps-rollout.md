# Free Forever caps — validation and rollout

Migration: `supabase/migrations/2026-09-30_free_tier_caps_race_safe.sql`
Local test: `npm run test:db:free-tier`

## What this is

The Free Forever plan promises 10 customers, 10 vehicles and 5 jobs per calendar
month. `supabase/migrations/free_tier_usage_limits.sql` was written to enforce
that but was never applied: on both production (`ldjrlvjkmzrcdqhetqoh`) and
staging (`kfwxmfvlfdurvjruadtc`) `public.enforce_free_tier_count_limit()` and its
triggers were found missing before rollout. **Enforcement is now installed on
production and staging (2026-10-01, Asia/Bangkok).** This migration installs the
function and three `BEFORE INSERT` triggers with advisory locking and supersedes
the original file. Do not run the original afterwards.

## Behaviour

| | |
|---|---|
| Limits | 10 customers, 10 vehicles, 5 job cards per calendar month, per shop |
| Who is limited | shops whose **owner** (`shop_users.role = 'owner'`) has `profiles.plan = 'free'` |
| Not limited | paid plans; shops with no owner row; an owner with no profile row (established behaviour, kept, not an entitlement change) |
| Error | `FREE_TIER_LIMIT:<table>:<limit>` (P0001), rendered by `lib/freeTierLimit.ts` |
| Checked on | `INSERT` only |

### Things to know (found while reviewing; none silently changed)

0. **The job cap counts OPEN jobs checked in this month, not jobs created this
   month.** Closing a job copies it to `closed_jobs` and deletes it from
   `job_cards` (`services/jobCardService.ts`), and the trigger counts only
   `job_cards`. A free shop that closes jobs can keep creating more, so "5 jobs
   per month" behaves as "5 open jobs at once". The original design had the same
   gap. **Decision (owner, 2026-10-01): ship as reviewed (option A).** Customers
   and vehicles are exact. Counting open plus closed jobs is a possible later
   forward migration; it needs `closed_jobs` columns checked and staging
   re-validation.
1. **`job_cards.check_in_date` is caller-supplied.** `services/jobCardService.ts`
   inserts `fields.checkInDate || new Date()`, so a client can backdate a job
   out of the current month and escape the count, and a future-dated job counts
   against this month. The cap also ignores the new row's own date.
2. **Month boundary uses the database time zone** (`date_trunc('month', now())`,
   UTC on Supabase), not Laos time (UTC+7): between 00:00 and 07:00 Laos time on
   the 1st, the previous month's jobs still count.
3. **Column types.** On staging, `job_cards.check_in_date` and
   `job_cards.created_at` are both `timestamptz`, nullable, default `now()`
   (verified). `created_at` exists (an earlier comment said it did not). It is no
   safer than `check_in_date`: the app does not send it on job inserts, but it is
   equally writable through the API and can be NULL (a NULL is never counted).
   Tamper-resistance would need a `BEFORE INSERT` trigger forcing it to `now()`,
   which changes behaviour for every shop. Not done. Production's types are
   confirmed by the production preflight.
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

### Rollout record / project memory (2026-10-01, Asia/Bangkok)

These results were observed through the Supabase connector in the rollout
session and reported to Claude Code; Claude did not independently observe them.
The corresponding UTC date is 2026-09-30. Local Docker results below are reported
by the development session, not re-run by the connector session.

| Check | Evidence and result |
|---|---|
| Staging installation (`kfwxmfvlfdurvjruadtc`) | Migration succeeded with its acceptance checks; all three cap triggers enabled. |
| Staging sequential checks as `postgres` | Free fixtures stopped at 10 customers, 10 vehicles and 5 job cards; professional fixtures accepted 12 of each. Temporary fixtures rolled back; leftovers 0. |
| Staging application-role check | Role `authenticated` and owner `auth.uid()` verified. Free shop: 10 committed customer rows and 4 refusals with `FREE_TIER_LIMIT:customers:10`. Professional shop: 14 inserts succeeded. |
| Staging cleanup | Only this run's exact fixture IDs were deleted; auth users, profiles, shops, membership, shop settings and customer leftovers verified as 0. The standalone script's `--cleanup` was not run. |
| Production installation (`ldjrlvjkmzrcdqhetqoh`) | Owner authorized proceeding while skipping remaining staging checks. Migration succeeded and its acceptance checks passed. Advisory lock, empty search path and revoked anon/authenticated EXECUTE verified. |
| Production trigger check | Six enabled triggers: three new `trg_free_tier_limit` triggers and three unchanged original triggers. |
| D1 production database smoke | Shop 1 customer, vehicle and job-card inserts succeeded as `authenticated`, with owner JWT identity verified. Temporary records rolled back; leftovers 0. This was a database-write check, not a browser or full application workflow test. |
| Real-schema concurrency | **INCONCLUSIVE / unvalidated.** Connector requests were submitted in parallel and used distinct backend IDs, but recorded SQL execution intervals did not overlap. The connector serialized execution, so the 10-and-4 outcome does not prove simultaneous-write safety. |
| Local concurrency | Development-session report: the local Docker suite's 14 separate sessions stopped at 10 customers, 10 vehicles and 5 jobs, while the original unlocked control overshot to 14. This uses stub tables, not the real schema. |

Production's six enabled triggers are:
- `customers.trg_free_tier_limit`
- `vehicles.trg_free_tier_limit`
- `job_cards.trg_free_tier_limit`
- `vehicles.vehicles_stamp_completed_at`
- `job_cards.job_cards_alert_assigned`
- `job_cards.job_cards_alert_work_added`

**Carry-forward note:** production enforcement is live. Preserve the documented
open-job/date-counting caveats and the effect on `plan='free'` with a live trial.
Do not mark real-schema concurrency or browser smoke as passed. The staging
application-role inserts above did pass; they must not remain labeled pending.

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

## Remaining staging validation: true concurrency

Installation, sequential real-schema behavior and authenticated-role inserts are
validated as recorded above. **True simultaneous writes on the real schema
remain unvalidated.** Database-connector parallel submission did not produce
overlapping SQL execution.

The standalone script is `tests/db/staging/free-tier-concurrency-staging.mjs`
(merged in PR #58). It has **not been run** by the connector session. It needs a
direct or session-pooler staging connection on port 5432, supplied privately by
the operator. Never put a connection string or password into chat or source.

Before running the merged script, address the review findings: parse and verify
the actual connection destination instead of accepting a ref substring anywhere
in the URL; verify TLS certificates; assign unique run IDs and scope cleanup to
exact fixture IDs; wait for all workers to finish before cleanup even when a
connection fails; assert application role and owner JWT identity on every worker.
No hardened follow-up run is claimed in this record.

The customers concurrency check should use 14 separate connections with
overlapping transactions: expect 10 commits, 4 exact cap refusals, 10 stored rows,
and 14 commits for a professional shop. Confirm cleanup leaves zero fixtures.
Vehicles and job-card true-concurrency checks on the real schema also remain
pending; the shared function alone does not prove every table's behavior.

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

Production is `ldjrlvjkmzrcdqhetqoh`. **Applied on 2026-10-01 (Asia/Bangkok)**
with owner authorization to proceed while skipping the remaining staging checks.
Preflight found no existing cap function or conflicting triggers, and required
column types matched. Acceptance and post-install checks passed. Do not reapply
merely because an older handoff says production is pending.

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
