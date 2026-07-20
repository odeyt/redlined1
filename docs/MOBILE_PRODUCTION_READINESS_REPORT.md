# Mobile Production Readiness Report

Final synthesis of the mobile-production-readiness security/release-hardening
task. Every sub-document this references was produced in this same pass;
this report doesn't introduce new findings, it rolls the others up.

## Git / deployment-history verification

See `docs/DEPLOYMENT_HISTORY_VERIFICATION.md` in full. Summary:

- PR #6 (coordinated messaging security) **is now merged into `origin/main`**
  (`f547baf`, confirmed via `git fetch` + `git branch --contains` this
  session — an earlier same-day check had found it NOT merged yet; it
  landed in between).
- This session's own working branch, `feat/platform-foundation`, forked
  from `main` **before** that merge and has since diverged (missing 5
  commits main has, ahead by 17 of its own) — needs a rebase before release.
- **Production deployments on Vercel carry no git metadata** — it is not
  possible to confirm which commit is actually live on `redlined1.com` from
  git or Vercel tooling alone. Deployments appear to be manual CLI
  invocations, not an automatic merge-triggered pipeline.
- **No staging Supabase environment exists** — confirmed via `vercel env
  ls` (every Supabase credential is Production-scoped only).

## Live/staging RLS findings

See `docs/LIVE_RLS_VERIFICATION.md` and `docs/DATABASE_SECURITY_FINDINGS.md`
in full. No live or staging database execution was available this session —
every finding is labeled per the required scheme:

- **VERIFIED LIVE (1 finding, not independently re-run this session, cited
  from a prior session's live REST probe):** `shops` and `shop_users` had
  RLS **disabled**, readable by the anonymous key, as of 2026-07-18. A fix
  is drafted (`docs/PRODUCTION_SECURITY_REMEDIATION.sql`) but **not
  applied**.
- **VERIFIED STAGING:** none — no staging project exists yet.
- **CODE INFERENCE ONLY:** the other ~34 tables in this schema, all in
  `docs/DATABASE_SECURITY_FINDINGS.md`'s matrix.
- **UNKNOWN:** ~15 tables with no committed RLS statement found at all.

## Critical/high findings

Full matrix in `docs/DATABASE_SECURITY_FINDINGS.md`. Highlights:

- **CRITICAL (12+ tables):** a live `anon` CRUD grant is committed
  (`grant-permissions.sql`) with either confirmed-disabled RLS
  (shops/shop_users), no RLS statement found at all (messages, audit_logs,
  technician_tasks, time_entries, parts_orders, parts_vendors,
  vehicle_images, +more), or a permissive `USING (true)` policy
  (technicians).
- **HIGH:** `profiles` and `campaigns`/`followups` (platform-wide read for
  any authenticated user, any shop); `estimates` (narrow anon portal policy
  coexists with a wider blanket anon grant); `payments` and `shop_settings`
  (shop-scoped but no role gate — a possible regression from an older,
  stricter policy generation).
- **MEDIUM:** everything with a confirmed shop-scoped policy in code but no
  live confirmation (customers, vehicles, job_cards, repair_orders,
  appointments, inspections, invoices, parts, maintenance_schedules).

## Migrations created

Six new forward-only migrations
(`supabase/migrations/20260720_01` through `_06`), plus one gap fix to the
pre-existing `job_status_audit_log.sql` (added a `UNIQUE(request_id)`
constraint). All **drafted, none applied anywhere**. See
`docs/RLS_REMEDIATION_ROLLBACK.sql` for the paired rollback, which
deliberately keeps most rollback statements commented out since reverting a
security fix is itself a security downgrade.

## Policies created or changed

- New helper functions: `current_user_is_shop_member`,
  `current_user_has_shop_role`, `current_user_can_read_financials`,
  `current_user_can_manage_staff` (deliberately no
  `current_user_is_platform_admin` — that authorization model is env-var
  based at the API layer, not RLS-representable — see
  `20260720_01_rls_helper_functions.sql`'s header for the reasoning).
- Shop-scoped policies replacing permissive ones: `profiles`, `technicians`,
  `campaigns`.
- New shop-scoped policies for previously-unprotected tables:
  `estimate_followups`, `subscriptions`.
- Schema-agnostic "enable RLS, no policy yet" closure for ~18 tables whose
  exact column layout wasn't confirmed this session (safe — denies all
  non-service-role access rather than guessing a policy that might
  reference a wrong or nonexistent column).
- Role-gated policies (technician excluded) for `payments`.
- Storage: `authenticated`-only write policies for the `shop-assets` bucket
  (blocks anon upload/update/delete; does not yet add shop-path scoping —
  see Storage findings).

## Storage findings

See `docs/STORAGE_SECURITY_AUDIT.md` in full. `shop-assets` is the only
bucket in this codebase. Public, no shop-namespaced paths, no signed URLs
used anywhere, upload/delete performed by the client-side authenticated
Supabase client directly (not a server route) — meaning Storage object
policy is the *entire* authorization boundary for writes today, and it was
unconfirmed live. This session's fix closes anonymous write only; full
remediation (private bucket, shop-scoped paths, signed URLs) is a larger,
explicitly out-of-scope-for-this-session follow-up, consistent with the
pre-existing `SHOP_ASSETS_STORAGE_REVIEW.md`'s own scoping decision.

## Integration-test results

**Not run against real infrastructure — no staging project exists.**
`npm run test:integration:security` was run and confirmed to **skip
cleanly** (4 suites, 4 skipped, exit code 0) with no credentials set, per
its design requirement. The suite itself (tenant isolation, role isolation,
mutation safety, storage — `test/integration/security/*.test.ts`) type-checks
cleanly as part of the full-project `npx tsc --noEmit` run. It has never
executed against a real database.

## Web test/build results

All run in this session, against current (pre-remediation) code — none of
the new migrations have been applied anywhere, so these confirm code
health, not post-migration behavior:

- `npx tsc --noEmit`: clean.
- `npx jest --no-coverage`: **394/394 passing**, 24 suites.
- `npm run build`: succeeds, all routes compile including `/api/job-status`.
- Playwright e2e/smoke/auth/billing/job-card tests: **not run.** They
  default to `http://localhost:3000` with whatever Supabase credentials
  `.env.local` provides — which is production. Running real signup/billing/
  job-card flows against production data to satisfy a test-run instruction
  would itself violate this task's "never modify production data" rule;
  skipped for that reason, not omitted by oversight.

## Mobile test/export results

Re-run this session against current mobile code (unchanged from the prior
Phase 2.5 session):

- `npx tsc --noEmit`: clean.
- `npx jest`: **95/95 passing**, 12 suites.
- `npx expo export --platform android`: succeeds.
- `npx expo export --platform ios`: succeeds.
- **Not verified:** runtime behavior against a staging Supabase/API (none
  exists) or a real device.

## Physical-device status

**Not performed.** No physical Android device is available in this
environment. `docs/MOBILE_PRODUCTION_ANDROID_CHECKLIST.md` is prepared with
every required step but every row is unfilled, pending a human tester.

## Remaining issues

1. Apply `docs/PRODUCTION_SECURITY_REMEDIATION.sql` — the one VERIFIED LIVE
   critical finding, still open.
2. Stand up staging (`docs/STAGING_SUPABASE_SETUP.md`) and re-run
   `docs/MOBILE_RLS_AUDIT.sql` there to convert CODE INFERENCE ONLY /
   UNKNOWN findings into VERIFIED STAGING ones.
3. Apply the 6 new migrations to staging, run
   `npm run test:integration:security` for real, fix any regression found
   (per this task's own instruction: fix by adding a new scoped policy,
   never by reopening a permissive one).
4. Rebase `feat/platform-foundation` onto current `main` — the branches
   have diverged (§ Git verification above).
5. Execute `docs/MOBILE_PRODUCTION_ANDROID_CHECKLIST.md` on a real device
   against staging.
6. Resolve the storage bucket findings (`docs/STORAGE_SECURITY_AUDIT.md`) —
   at minimum before any mobile upload feature is built, per this task's
   own instruction.
7. Confirm which mechanism actually represents a "disabled" user in
   production (this session assumed `profiles.status`, unconfirmed live) —
   needed for the role-isolation integration test to be meaningful.

## Production readiness by category

| Category | Score | Basis |
|---|---|---|
| Web application (code/build health) | **85%** | tsc clean, 394/394 tests, build succeeds. Not 100%: Playwright suites unrun, branch divergence unresolved. |
| Database security | **15%** | One CRITICAL finding VERIFIED LIVE and still open; ~30 more tables CODE INFERENCE ONLY or UNKNOWN, never confirmed; remediation drafted but zero migrations applied anywhere. |
| Mobile code | **90%** | 95/95 tests, clean typecheck, both platform exports succeed, unchanged and already-reviewed from the prior session. |
| Mobile runtime | **0%** | Never run against anything but mocks — no staging, no device. Not a partial score; genuinely unverified. |
| Mobile production release | **0%** | Blocked on every prerequisite above; cannot be assessed independently of them. |

These are deliberately not averaged into one number — a single blended
score would hide that "mobile code" being healthy says nothing about
whether it's safe to point that code at production data, which is the
actual question this task exists to answer.

## Final recommendation

**BLOCKED.**

Per this task's own gate: *"Never select READY FOR PRODUCTION APPROVAL
unless: Live or staging audit was actually executed; all critical/high RLS
findings are resolved; staging migrations passed; security integration
tests passed; exact production release plan exists; Android physical-device
test is completed or explicitly accepted as a remaining pre-store-release
gate."* Of those six conditions, only one is fully met (the production
release plan exists — `docs/PRODUCTION_SECURITY_RELEASE_PLAN.md`). The
other five are open. This is not READY FOR STAGING ONLY either, in the
sense of "staging is ready to receive this" — staging itself does not exist
yet and must be created first (`docs/STAGING_SUPABASE_SETUP.md`) before
anything in this release can be tested at all.
