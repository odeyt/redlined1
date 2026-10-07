# Completion-date stamps — rollout record

Migration: `supabase/migrations/2026-10-07_stamp_completion_dates.sql`
(git blob `dc161203718ec31fdc3e81a95407e34c43e5d19d`, added in `d3aa3bc`, merged by PR #74)
Local test: `npm run test:db:completion-stamp` (throwaway Docker Postgres, stub tables)

## What it is

Reports place a completed job in the month of its completion date
(`repair_orders.closed_date`, and `closed_jobs.closed_date` for jobs closed with
"Close"). PR #74 fixed the app so that reopening clears that date and a fresh
completion stamps the moment it happens; before it, a reopened repair order kept
its first completion date and, signed off again, was reported in the wrong month.

This migration is the database safety net for the same rule, so it holds for any
path that writes these tables, including ones written later. It adds two
`BEFORE INSERT OR UPDATE OF status, closed_date` row triggers:

| Trigger | Table | Function | Finished statuses |
|---|---|---|---|
| `repair_orders_stamp_closed_date` | `public.repair_orders` | `public.stamp_repair_order_closed_date()` | `Complete`, `Closed` |
| `job_cards_stamp_closed_date` | `public.job_cards` | `public.stamp_job_card_closed_date()` | `Complete`, `Closed`, `Invoiced` |

Rule: becoming finished with no new date stamps `now()` (a date supplied in the
same write is kept); staying finished keeps the date; leaving finished, or being
open, clears it. Both functions are `SET search_path = ''` with EXECUTE revoked
from PUBLIC. Applying the migration changes no existing rows.

## Status (2026-10-07)

| | Staging `redlined1-staging` (`kfwxmfvlfdurvjruadtc`) | Production `redlined1` (`ldjrlvjkmzrcdqhetqoh`) |
|---|---|---|
| Migration applied | Yes | Yes, with the owner's explicit approval as an exception to the security hold (below) |
| Triggers installed and enabled | 2 of 2 | 2 of 2 |
| Function definitions | — | Read and matched staging exactly |
| Finished repair orders without a date | 1 | 11 (same before and after applying) |
| Open repair orders with a stale date | 0 | 0 |
| Finished job cards without a date | 0 | 0 |
| Rolled-back behaviour test | Passed | Passed |
| Source of the evidence | Supabase connector session | Supabase connector session |
| Independently reverified in the closeout | **No** | **No** |

**Not independently reverified here.** All database evidence in this record was
produced by the connector session that applied the migration, and is recorded as
it reported it. The closeout session (Claude Code, 2026-10-07) had no database
access: no Supabase MCP, CLI, `psql` or credentials. Every item above should be
read as "connector verified in prior session; not independently reverified here".
The queries under [Re-verification](#re-verification-read-only) let anyone with
access confirm them.

What the closeout session did verify: the migration is on `main` (blob above);
PR #74 (`e01e7fd`) and PR #75 (`3b6b69b`) are on `origin/main`; the newest
production deployment of `redlined1-s-projects/redlined1` is Ready and
`https://redlined1.com` returns 200; and the local throwaway-Postgres test passed
all 14 checks earlier the same day (stub tables, not the real schema).

### Behaviour tests (rolled back)

Each test ran in one transaction that changed status and `closed_date` through
the full sequence and ended with an intentional `RAISE EXCEPTION`, so every change
rolled back. Its message, `STAMP TEST PASS (intentional rollback)`, is a passing
result, not a failed rollout. Checks, on both tables:

1. Finishing stamps `now()`.
2. An explicit date set while finished is kept.
3. Reopening clears `closed_date`.
4. Finishing again stamps `now()`, not the old date (the original bug).
5. Job cards only: `Complete` to `Invoiced` keeps the date.

Matching timestamps for the first and second completion are expected: `now()` is
fixed for the whole transaction.

| | Staging | Production |
|---|---|---|
| Test time | 2026-10-07 19:29:18.711653 Asia/Bangkok (12:29:18Z) | 2026-10-07T12:45:20.382768Z (19:45:20 Asia/Bangkok) |
| Repair order used | `a95a8890-7c2a-4ed0-89bb-85969dd08a9e`, `Complete`, `closed_date` NULL | `febb9902-dd67-4e91-adde-9e92efed87cd`, `In Progress`, `closed_date` NULL |
| Its row fingerprint before = after | `f8836cb63cff34df55dc4c0a80e5f531` | `e412f4ff4df3bdf7bb9c5261a276620c` |
| Job card used | `JC-1789965305574`, `In Progress`, `closed_date` NULL | `JC-1791350394798`, `Booked`, `closed_date` NULL |
| Its row fingerprint before = after | `a071321ebab2beb1912c07548f53c6ff` | `4b77c350ed316ded443f8c5e8ed0d46b` |

Fingerprints are full-row md5 hashes taken before and after each test; identical
values show nothing was saved. For production the method is recorded as
`md5(to_jsonb(row)::text)`; for staging the connector reported "full-row
fingerprints" without naming the expression. The write-based test is not to
be repeated on production.

## Historical data left unchanged

The triggers act only on future writes. Rows already in these states were not
touched:

- **Production: 11 repair orders** are finished (`Complete`/`Closed`) with no
  completion date. **Staging: 1** (the repair order the staging test used).
- They appear in no "completed in" month. Each will get a date the next time its
  status changes. A backfill needs evidence of when each was really finished, plus
  separate authorization. Guessing (from `opened_date`, the arrival date or today)
  would file the work in the wrong month, which is the error this change removes.

## Migration history

The repository is not managed by the Supabase CLI. There is no
`supabase/config.toml`, files are named `YYYY-MM-DD_name.sql` rather than
`<14-digit version>_name.sql`, and most earlier migrations were applied by hand in
the SQL editor, so they have no row in `supabase_migrations.schema_migrations`.

The connector applied this one with `apply_migration(name="stamp_completion_dates")`.
That records a row whose `version` is a timestamp chosen at apply time, and whose
`name` is `stamp_completion_dates`, on each project. So:

- **The database version will not equal the repository filename.** This is
  expected for this repository, not drift. The `name` matches the filename's suffix.
- **The two projects' versions differ from each other**, being applied at
  different times.
- **The recorded versions were not read in the closeout** (no access). Fill them
  in from the query below.

| | Repository file | Recorded version | Recorded name |
|---|---|---|---|
| Staging | `2026-10-07_stamp_completion_dates.sql` | _not yet read_ | `stamp_completion_dates` (per connector) |
| Production | `2026-10-07_stamp_completion_dates.sql` | _not yet read_ | `stamp_completion_dates` (per connector) |

**Reconciliation proposal (nothing done automatically):** keep the repository
file as the source of truth and do not rename it. Record each project's recorded
`version` in the table above. If the statements stored in history differ in
substance from the file, stop and review before doing anything else. Do not edit
`schema_migrations`, mark history repaired, or reapply the DDL. If the repository
later adopts the Supabase CLI, map this file to its recorded version at that point.

## Re-verification (read-only)

Run on each project, after checking the project name in the dashboard's top bar.

```sql
-- 1. Triggers: expect 2 rows, both enabled ('O'), BEFORE row triggers.
SELECT c.relname, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS def
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND t.tgname IN ('repair_orders_stamp_closed_date', 'job_cards_stamp_closed_date');

-- 2. Functions: security, search_path, and a body hash to compare across projects.
SELECT p.proname, p.prosecdef AS security_definer, p.proconfig AS settings,
       md5(pg_get_functiondef(p.oid)) AS definition_md5
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('stamp_repair_order_closed_date', 'stamp_job_card_closed_date');

-- 3. Historical counts: expect production 11 / 0 / 0, staging 1 / 0 / 0
--    (these change only as people complete or reopen work).
SELECT
  (SELECT count(*) FROM public.repair_orders WHERE status IN ('Complete','Closed') AND closed_date IS NULL) AS finished_ro_without_date,
  (SELECT count(*) FROM public.repair_orders WHERE status NOT IN ('Complete','Closed') AND closed_date IS NOT NULL) AS open_ro_with_stale_date,
  (SELECT count(*) FROM public.job_cards WHERE status IN ('Complete','Closed','Invoiced') AND closed_date IS NULL) AS finished_jc_without_date;

-- 4. Migration history for this migration.
SELECT version, name, md5(array_to_string(statements, E'\n')) AS statements_md5
FROM supabase_migrations.schema_migrations
WHERE name ILIKE '%stamp_completion%';
```

Expected for query 2: `security_definer = false`, `settings = {search_path=""}`,
and the same `definition_md5` on both projects.

## Rollback

**Schema rollback only.** It removes the triggers and functions. It does not undo
completion dates that were stamped or cleared while they were installed, and it
does not reconcile migration history by itself.

```sql
BEGIN;
DROP TRIGGER IF EXISTS repair_orders_stamp_closed_date ON public.repair_orders;
DROP TRIGGER IF EXISTS job_cards_stamp_closed_date ON public.job_cards;
DROP FUNCTION IF EXISTS public.stamp_repair_order_closed_date();
DROP FUNCTION IF EXISTS public.stamp_job_card_closed_date();
COMMIT;
```

The app-side rule from PR #74 stays in force without the triggers.

## Security hold

The production security hold (pg_net grants open to PUBLIC, push secret not
rotated) is **still open**. The exception covered only this completion-date
rollout; the migration touches no grants, secrets or pg_net objects. The
remediation is planned separately in `docs/security-hold-remediation-plan.md`.

## Related

- PR #74: app fix (reopen clears the date; re-completion stamps now) and this migration file.
- PR #75: Job Archive reads `closed_jobs` as well, for both locations.
- `lib/repairOrders/completionStamp.ts`: the app-side rule.
- `lib/vehicles/completedWork.ts`: how reports read completion dates.
