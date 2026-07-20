# Mobile Production Android Checklist

**Not performed.** I have no physical Android device, camera, or ability to
interact with a real phone in this environment — every row below is
prepared for a human tester to execute and record, exactly as this task's
own instruction requires: *"The human tester must confirm completion.
Claude must not mark this passed without user-provided results."*

This is a **production-readiness** checklist, distinct from the earlier
`docs/ANDROID_PHYSICAL_DEVICE_TEST.md` in the mobile repo (`C:\Users\wallyd1\REDLINE MOBILE\mobile-app\docs\`,
written for Phase 2.5's general device-runtime validation). This one is
scoped specifically to confirming the RLS/role/tenant boundaries this
task's remediation targets actually hold from a real device, once staging
exists and the remediation migrations have been applied and tested there
(Phase 8). **Do not run this against production** until Phase 15's
production execution gate has been explicitly approved — run it against
staging first.

## Prerequisites

- A physical Android device, Developer Options + USB debugging enabled.
- Staging Supabase project set up per `docs/STAGING_SUPABASE_SETUP.md`,
  with `supabase/migrations/20260720_*.sql` applied and
  `docs/MOBILE_RLS_AUDIT.sql` re-run against it showing no CRITICAL/HIGH
  findings.
- A staging build of the mobile app pointed at staging Supabase + a staging
  REDLINED1 API deployment (Vercel Preview, per
  `docs/STAGING_SUPABASE_SETUP.md` §6) — **never point a build used for
  this checklist at the production anon key or production API.**
- Test accounts from `test/integration/security/helpers/testEnvironment.ts`
  (or manually created equivalents): Shop A owner/manager/advisor/technician,
  Shop B owner/technician, a no-shop user, a disabled user.

## Checklist

| # | Step | Expected result | Actual result | Pass/Fail | Screenshot | Notes |
|---|---|---|---|---|---|---|
| 1 | Install the staging build on the device | App launches, DEV/STAGING badge visible (per the mobile app's existing environment badge) | | | | |
| 2 | Log in as Shop A owner | Redirects to Dashboard (single shop, no picker) | | | | |
| 3 | Force-close and reopen the app | Session restores silently, no re-login prompt | | | | |
| 4 | View Job Cards list | Only Shop A's job cards appear | | | | |
| 5 | View Customers / Vehicles lists | Only Shop A's rows appear | | | | |
| 6 | Log out, log in as Shop A technician | Dashboard loads; technician-appropriate UI (no payments/financial screens, if any exist in the mobile UI at this stage) | | | | |
| 7 | As Shop A technician, attempt to advance a Shop A job's stage (valid transition) | Succeeds | | | | |
| 8 | As Shop A technician, attempt an invalid stage transition (e.g. skip a stage, if the UI allows constructing one — otherwise test via a direct API call using the device's captured token) | Denied with `INVALID_JOB_TRANSITION`, job unchanged | | | | |
| 9 | As Shop A technician, attempt to act on a Shop B job id (requires knowing/guessing one — use the test environment's known Shop B job id for this check) | Denied — `JOB_NOT_FOUND` or `NOT_MEMBER_OF_SHOP`, never a successful mutation | | | | |
| 10 | Log out, log in as an account belonging to both Shop A and Shop B (multi-shop) | Explicit shop-selection screen shown — never auto-picks a shop | | | | |
| 11 | Select Shop B, view its Job Cards/Customers/Vehicles | Only Shop B's data appears, no Shop A leakage | | | | |
| 12 | Log out, log in as the no-shop test user | Fails closed — no job cards / customers / vehicles shown, no error that implies partial access | | | | |
| 13 | Log out, attempt login as the disabled test user | Denied, or logs in but immediately shows a fail-closed empty state — record whichever actually happens, both are acceptable, a successful full dashboard load is not | | | | |
| 14 | Enable airplane mode mid-session, attempt to view Job Cards | Clear offline state shown, no crash | | | | |
| 15 | Restore network | App recovers, data reloads | | | | |
| 16 | Background the app for 60+ seconds, resume | Session still valid, no unexpected reload/flash | | | | |
| 17 | Log out | Returns to login; relaunching does not restore the old session | | | | |

## Sign-off

This checklist is **not** considered passed until a human has executed
every row above against a real staging environment on a real device and
filled in Actual result / Pass-Fail / Screenshot for each. Report the
completed table back before this feeds into
`docs/MOBILE_PRODUCTION_READINESS_REPORT.md`'s mobile-runtime readiness
score — an unfilled or partially-filled table must be scored as not-yet-verified,
never estimated or assumed passing.
