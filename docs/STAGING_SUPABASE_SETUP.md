# Staging Supabase Setup

**Required because:** `docs/DEPLOYMENT_HISTORY_VERIFICATION.md` confirms (via
`vercel env ls`) that every Supabase-related environment variable in this
Vercel project is scoped to `Production` only — no staging Supabase project
is configured anywhere. Phase 8 of the mobile-production-readiness task
cannot proceed (apply remediation migrations, re-run the RLS audit, run the
security integration suite) without one.

## 1. Project creation

1. In the Supabase dashboard, create a new project — e.g.
   `redlined1-staging`. Same region as production (`redlined1-prod`, or
   whatever the live project is actually named — confirm in the dashboard,
   this was not independently verified this session) to keep latency
   characteristics comparable for realistic testing.
2. Record the new project's URL, anon key, and service-role key
   immediately — do not commit any of them to git, ever, in any form
   (including as a "temporary" value in a script or doc).

## 2. Schema migration

Do **not** attempt to clone the schema by copying `.sql` files from this
repo in migration-authorship order — this task's entire premise is that
those files do not reliably reflect what's actually live. Instead:

1. Use the Supabase dashboard's own schema-diff/migration export from the
   **production** project (Database → Migrations, or `supabase db dump`
   via the Supabase CLI against production with a read-only role) to get
   the actual current schema, not the repo's historical record of it.
2. Apply that dump to the new staging project.
3. Only after that baseline is in place, apply this task's new migrations
   (`supabase/migrations/20260720_*.sql`, in numeric order) on top —
   staging is exactly where Phase 8 wants these tested first, before
   production.

## 3. Safe data seeding

Do not copy any real customer/vehicle/job data from production into
staging, under any circumstance — this would move real PII into a
lower-security environment for no benefit (the goal is to test access
*control*, not realistic data volume).

`test/integration/security/helpers/testEnvironment.ts` (this task's new
integration suite) already provisions everything it needs — two throwaway
shops, 8 test users, and a handful of `sectest-`-prefixed rows — and tears
all of it down after each run via the service-role client. **No manual
seeding is required** for the security suite to run once staging exists;
just point its env vars at the new project (§5 below).

If you separately want staging populated with realistic-but-fake data for
manual QA (outside this task's scope), generate synthetic data — do not
copy production rows.

## 4. Test users / role accounts

Not required as a manual setup step — `testEnvironment.ts` creates and
destroys these automatically:

| Account | Shop | Role |
|---|---|---|
| Shop A owner | Shop A | owner |
| Shop A manager | Shop A | manager |
| Shop A advisor | Shop A | advisor |
| Shop A technician | Shop A | technician |
| Shop B owner | Shop B | owner |
| Shop B technician | Shop B | technician |
| No-shop user | none | — |
| Disabled user | Shop A | technician, `profiles.status = 'Inactive'` |

If you want a **persistent** set of manual-testing accounts (e.g. for
exploratory QA in the Supabase dashboard or a staging web deployment,
separate from the automated suite), create them the same way — via
Supabase Auth (dashboard or `admin.auth.admin.createUser`) plus a
`shop_users` row — and prefix emails clearly (e.g. `manual-qa-...@...`) so
they're never mistaken for real accounts.

## 5. Environment variables

For the security integration suite (`npm run test:integration:security`),
set these in your local shell or CI secret store — **never in a committed
`.env` file**:

```
SUPABASE_TEST_URL=<staging project URL>
SUPABASE_TEST_ANON_KEY=<staging anon key>
SUPABASE_TEST_SERVICE_ROLE_KEY=<staging service role key>
TEST_DATABASE_CONFIRMATION=REDLINED1_STAGING_ONLY
REDLINED1_API_BASE_URL=<staging web app deployment URL, for the job-status API tests>
```

The exact `TEST_DATABASE_CONFIRMATION` value above is required verbatim —
see `test/integration/security/helpers/guard.ts`. The suite also refuses to
run (throws, does not silently proceed) if `SUPABASE_TEST_URL` happens to
equal `NEXT_PUBLIC_SUPABASE_URL` (i.e. someone pasted production
credentials into the staging slot by mistake).

For the staging **web app deployment** itself (§6 below), the equivalent of
production's `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` need to be set in Vercel, scoped to `Preview`
(not `Production`) — see below.

## 6. Vercel Preview configuration

1. In the Vercel dashboard for project `d1-redline`: Settings →
   Environment Variables → add `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` scoped to
   **Preview** only, with the staging project's values.
2. This makes every branch/PR preview deployment (already confirmed active
   per `DEPLOYMENT_HISTORY_VERIFICATION.md` — the `-git-<branch>-` alias
   pattern) automatically run against staging Supabase instead of having no
   Supabase config at all (today's actual state, per that same doc).
3. `REDLINED1_API_BASE_URL` for the integration suite (§5) should point at
   whichever specific Preview deployment URL you're testing against for a
   given run — these change per-deployment, so this is set per test-run,
   not saved permanently.

## 7. Cleanup strategy

- **Automated runs:** `testEnvironment.ts`'s `teardown()` removes every row
  and auth user it created, every time, via `afterAll`. If a run is
  interrupted (crash, forced kill) before teardown completes, leftover rows
  are all prefixed `sectest-<timestamp>-...` and leftover auth users are
  `sectest-<timestamp>-...@example.invalid` — both are safe to bulk-delete
  by prefix match at any time; nothing else in the schema should ever use
  that prefix.
- **Project lifecycle:** staging should be recreated periodically (e.g.
  before each major remediation pass) rather than accumulating
  years-old cruft — it's cheap to regenerate from a fresh production
  schema dump (§2) since it holds no real data worth preserving.
- **Credential rotation:** if staging credentials are ever pasted into a
  chat, script, or log by mistake, rotate them in the Supabase dashboard
  immediately — treat it the same as a production credential leak, even
  though the blast radius is smaller.
