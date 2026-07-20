# Deployment History Verification

Phase 0 of the mobile-production-readiness task. Every claim below is backed
by an actual command run in this session (`git log`, `git branch
--contains`, `git merge-base --is-ancestor`, `vercel ls`/`inspect`/`env
ls`/`project inspect`) — nothing here is inferred from a document or a
prior conversation's summary without independently re-checking it.

## Repository state

**`C:\Users\wallyd1\REDLINE`** (web app)
- Branch: `feat/platform-foundation`
- HEAD: `1feb1f9` (`feat(security): harden job status transitions and verify RLS`, previous task in this session)
- Working tree: clean except one **pre-existing, unrelated** untracked file, left untouched: `supabase/migrations/migration_dashboard_layouts.sql` (a personal-dashboard-widgets migration, not part of any task given to me — do not include it in any commit from this task).
- Remote: `origin` → `https://github.com/odeyt/redlined1.git`

**`C:\Users\wallyd1\REDLINE MOBILE\mobile-app`** (mobile app)
- Branch: `master`
- HEAD: `9a37e36` (`feat(mobile): validate device runtime and security boundaries`)
- Working tree: clean
- Remote: **none configured** — nothing has ever been pushed anywhere for this repo.

## Expected commit vs actual branch history

**Expected:** the coordinated-messaging-security work (this task's prompt calls it "previously claimed security-remediation commits"), source branch `feat/coordinated-messaging-security`, key commits `f1c1eda` / `4fbd434` / `160e93d`.

| Check | Result |
|---|---|
| `git branch --contains f1c1eda` | `feat/coordinated-messaging-security`, `origin/feat/coordinated-messaging-security`, **and now `origin/main`** |
| `git branch --contains 160e93d` | same three |
| `git branch --contains 4fbd434` | same three |
| Merged into `main`? | **Yes — `git log` on `origin/main` (after `git fetch origin`, which advanced `origin/main` from `de5a8c7` to `f547baf` during this session) shows `f547baf Merge pull request #6 from odeyt/feat/coordinated-messaging-security`, authored 2026-07-20 08:41:06 +0700.** |
| Merged into `origin/staging`? | **No.** `git merge-base --is-ancestor f547baf origin/staging` → false. `origin/staging`'s tip (`b8deb09`, landing-page/analytics work) shares no relevant recent history with `main` — it is a stale, long-diverged branch, not a maintained mirror of `main`. |
| Merged into `origin/preview`? | **No**, same result. `origin/preview`'s tip (`58d703f`, billing-gate fixes) is likewise stale/diverged, not a maintained mirror. |
| Merged into `feat/platform-foundation`? | **No.** This branch (my current working branch, containing the job-status hardening commit `1feb1f9`) was forked from `main` at `de5a8c7` — **before** PR #6 merged — and has not been rebased/merged since. It is now missing 5 commits `origin/main` has (`f1c1eda` → `f547baf`) and has 17 commits `origin/main` doesn't. **These two branches have diverged and need to be reconciled before either is released.** |

**Correction to a prior session's claim:** an earlier session (same day, earlier) checked this and reported PR #6 was *not* merged into `main` — that was accurate *at the time it was checked* (main's tip was still `de5a8c7`). It has since been merged (this session's `git fetch` pulled the new tip). The lesson stands even though the specific finding flipped: always re-fetch and re-check rather than trusting a stale local read of `origin/main`.

## Deployment mechanism (Vercel)

Project: `d1-redline` (`prj_bVhthFIrjUwe4ttQpPmZ62FcLRiH`, team `redlined1-s-projects`). Vercel CLI is installed and authenticated as `thammo01-7973`.

- **`redlined1.com` (the production domain)** currently resolves to deployment `dpl_9LYSVKXcmNWrRrG7EcwGK68SW2TA` (`vercel inspect redlined1.com`), created **2026-07-20 16:15:26 +0700 (3h before this check)**, `target: production`, `status: Ready`.
- **This deployment carries no Git metadata.** `vercel inspect <url> --json` was searched for `gitSource`, `githubCommitSha`, `ref`, `branch`, `meta` — none present. This means **it is not possible to determine, from Vercel's own deployment record, which git commit is actually running in production right now.**
- **Preview deployments ARE Git-connected**, by contrast: `vercel alias ls` shows auto-generated aliases like `d1-redline-git-feat-coordinated-mes-...` and `d1-redline-git-feat-platform-foundation-...`, matching Vercel's standard per-branch preview-deployment naming — confirming the GitHub integration exists and is active for non-production deploys.
- **Inference, not proof:** `vercel ls` shows five separate `Production`-target deployments in the last ~5 hours (most recent 3h ago), which is consistent with — but does not prove — a human repeatedly running a manual `vercel --prod` deploy from a local checkout as commits landed on `main` throughout the day, rather than an automatic "merge to main → deploy to production" pipeline. **Given no deployment carries git metadata, production deploys are most likely triggered by manual CLI invocation (`vercel --prod` or `vercel deploy --prod`) run from whatever a developer had checked out locally at that moment — not a traceable, auditable CI/CD pipeline.**
- **Practical conclusion:** whether PR #6 (or this session's `1feb1f9` job-status hardening) is actually live on `redlined1.com` **cannot be confirmed from git or Vercel deployment metadata alone.** The only way to know for certain is to check the live site's actual behavior (e.g., hit a route/response that only exists post-fix) or to ask whoever ran the most recent `vercel --prod` what branch/commit their local checkout was on at the time.

### Environment variable scope (Vercel)

`vercel env ls` (names/scopes only, all values remain encrypted, never fetched or displayed):

| Variable | Environments |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | **Production only** |
| `NEXT_PUBLIC_SITE_URL`, `RESEND_API_KEY`, `PLATFORM_OWNER_EMAIL`, `NEXT_PUBLIC_PLATFORM_OWNER_EMAIL` | **Production only** |

**No Preview- or Development-scoped values exist for any variable, including Supabase credentials.** This has two implications:
1. **No staging Supabase project is configured in Vercel at all** — Preview deployments either fail at runtime wherever they touch Supabase/site-URL config, or (more likely, given `lib/env.ts`-style code elsewhere in this codebase throws loudly on missing config) fail to build/serve those routes correctly. This was not independently tested against a live Preview URL in this session (out of scope for Phase 0; flagged for Phase 8/staging setup).
2. **This confirms Phase 8's fallback condition applies: no staging Supabase environment exists.** See `docs/STAGING_SUPABASE_SETUP.md` (created later in this task) for the exact setup this implies is needed before any RLS remediation can be tested pre-production.

## Recommended source branch for the production security release

**`feat/platform-foundation`, rebased onto current `origin/main` first.** Rationale:
- It already contains the job-status hardening (`1feb1f9`) and the honest, unexecuted RLS audit (`docs/MOBILE_RLS_AUDIT.sql`, `docs/LIVE_RLS_VERIFICATION.md`).
- It does **not** yet contain PR #6's messaging-security fixes, since it forked before that merge — rebasing picks those up automatically and removes the divergence noted above.
- `main` itself has no local work of its own beyond what's already reflected — no competing branch is closer to "ready."

**Do not rebase or push this session** — this is a recommendation for the next explicit action, not something to execute without approval (rebasing a shared branch changes its commit SHAs; per this task's own release-gate rules, that's an action to present, not perform, until sign-off, and per repo-wide git safety norms, force-updating history on a branch other sessions/people may be building on needs explicit confirmation first).

## What this means for the rest of this task

- Every "is X deployed" question in the remaining phases must be answered as **UNKNOWN (no reliable deployment-to-commit mapping exists)** unless independently verified against the live site's actual behavior, never asserted from git history alone.
- The staging gap (Phase 8) is real and confirmed, not just a possibility to check for — proceed straight to producing `docs/STAGING_SUPABASE_SETUP.md` rather than attempting to apply anything to a staging Supabase project that doesn't exist.
