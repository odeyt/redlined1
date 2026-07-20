# Production Security Release Plan

**Status: prepared, not executable yet.** Per this task's Phase 14
instruction ("Only after staging passes, create this plan"), this is
written *now* so it's ready the moment staging passes, but staging does
not exist yet (`docs/STAGING_SUPABASE_SETUP.md`) and therefore has not
passed. Do not execute any step below until every item in the
Pre-Deployment checklist is independently confirmed true, not assumed.

## Pre-deployment

- [ ] **Database backup confirmed** — take a fresh Supabase backup/snapshot
  of production immediately before applying any migration below. Confirm
  the backup is restorable (Supabase point-in-time recovery, or an
  explicit `pg_dump`), not just that a backup job "ran".
- [ ] **Migration order confirmed** — see "Database release" below for the
  exact sequence. Migrations are numbered (`20260720_01` through `_06`,
  plus the pre-existing `job_status_audit_log.sql` and
  `docs/PRODUCTION_SECURITY_REMEDIATION.sql`) specifically so this order is
  unambiguous.
- [ ] **Tested commit SHA confirmed** — the exact commit that was actually
  built and tested (staging web app deployment, staging mobile build) must
  be the same commit deployed to production. Given
  `docs/DEPLOYMENT_HISTORY_VERIFICATION.md`'s finding that this project's
  production deployments carry no git metadata, **record the commit SHA
  manually** as part of running the deploy command (e.g. `git rev-parse
  HEAD` immediately before `vercel --prod`, pasted into the deploy log/PR)
  — this project's current tooling will not do this for you.
- [ ] **Vercel environment variables confirmed** — `NEXT_PUBLIC_SUPABASE_URL`
  etc. for Production still point at the intended production Supabase
  project (unchanged by this release; the new migrations run against the
  *same* project, they don't introduce a new one).
- [ ] **No secrets in git** — `git status`/`git diff` reviewed for the exact
  commit being released; confirm no `.env*` file, no real Supabase key, no
  real staging/production credential is staged.
- [ ] **Staging test results confirmed** — `docs/LIVE_RLS_VERIFICATION.md`
  and `docs/DATABASE_SECURITY_FINDINGS.md` re-run against staging (not just
  code inference) show no remaining CRITICAL/HIGH findings, and
  `npm run test:integration:security` passes in full against staging.
- [ ] **Rollback strategy confirmed** — `docs/RLS_REMEDIATION_ROLLBACK.sql`
  reviewed by a human immediately before release, not just present in the
  repo. Understand which parts are safe to run (see that file's own
  "SAFE" vs "⚠ REDUCES SECURITY" sections) *before* you need them under
  time pressure.
- [ ] **Maintenance window** — likely not required (every migration here is
  additive or narrows an existing permissive policy; none of them lock a
  table for a meaningful duration or perform a data rewrite) but confirm
  this holds by checking each migration's actual runtime against the
  staging database's real row counts before assuming production will be
  equally fast.

## Database release

Apply in this exact order. After each step, run the paired verification
query from the same file (each migration includes one, or references
`docs/MOBILE_RLS_AUDIT.sql`) — **stop immediately on any unexpected
result**, do not proceed to the next migration.

1. `docs/PRODUCTION_SECURITY_REMEDIATION.sql` — closes the VERIFIED LIVE
   shops/shop_users exposure. This is the highest-priority, most
   time-sensitive step; everything else in this plan is secondary to
   closing this one.
2. `supabase/migrations/20260720_01_rls_helper_functions.sql`
3. `supabase/migrations/20260720_02_shop_membership_policies.sql`
4. `supabase/migrations/20260720_03_business_table_policies.sql`
5. `supabase/migrations/20260720_04_close_unprotected_tables.sql`
6. `supabase/migrations/20260720_05_financial_table_role_gate.sql`
7. `supabase/migrations/20260720_06_storage_policies.sql`
8. `supabase/migrations/job_status_audit_log.sql`

After all 8: **re-run `docs/MOBILE_RLS_AUDIT.sql` in full against
production** and confirm zero CRITICAL/HIGH rows remain in a refreshed
`docs/DATABASE_SECURITY_FINDINGS.md`. Do not proceed to the application
release below until this is clean.

## Application release

1. Deploy the exact tested commit — see Pre-deployment's "tested commit
   SHA confirmed" item; record the SHA in the deploy log.
2. Verify the deployed commit SHA matches what was tested (manually, per
   the same finding — this project's Vercel deployments don't self-report
   this).
3. Run production smoke tests against the **designated production test
   shop only** (create one if none exists — never test against a real
   customer's shop). At minimum: log in, load dashboard, view a job card,
   advance its stage, confirm the audit-log row appears
   (`job_status_transitions`), log out.
4. Confirm `/api/job-status` behaves per
   `docs/JOB_STATUS_SECURITY_AUDIT.md` (structured errors, state machine,
   idempotency) against production, using the test shop only.
5. Confirm authentication (login, session restore) still works for a real
   staff account.
6. Confirm billing is unaffected — this release does not touch
   `lib/billing/*`, `commercial/billing/*`, or any Creem/webhook code path,
   but the new financial-table RLS (payments/subscriptions role gate) does
   touch tables billing code reads. Load the billing/subscriptions page as
   an owner and confirm it still renders correctly.
7. Confirm customer and vehicle access still works for each role in the
   production test shop.

## Mobile release

**Do not submit to app stores** until all of the following are true:

- [ ] Android physical-device testing passes —
  `docs/MOBILE_PRODUCTION_ANDROID_CHECKLIST.md` fully executed by a human,
  against staging first, with real pass/fail results recorded (not this
  document's placeholder rows).
- [ ] Production RLS audit passes — the "Database release" re-run above
  shows no CRITICAL/HIGH findings.
- [ ] Web deployment passes — "Application release" above completed with
  no regressions.
- [ ] No high-severity issue remains open in
  `docs/DATABASE_SECURITY_FINDINGS.md` or
  `docs/JOB_STATUS_SECURITY_AUDIT.md`'s "Known risks".

Even once all four are true, this task's own scope excludes VIN scanning,
camera uploads, and other Phase 3 mobile features — store submission
readiness for the *current* mobile feature set (auth, multi-shop, job
cards, customers, vehicles, read-only) is a narrower question than
readiness for the eventual full feature set, and this plan only speaks to
the former.

## Who executes this

Every step above that touches the database or production deployment
requires your explicit, in-the-moment approval per this task's Phase 15 —
nothing in this plan is self-executing. See the Final Response for the
exact GO/NO-GO this session's work resolves to and what's still needed
before any step above can begin.
