# Redlined1 — Git Branching Strategy

## Branch Map

```
main ──────────────────────────────── production (redlined1.com)
  ↑                                    protected — PRs only
  │
staging ───────────────────────────── staging (staging.redlined1.com)
  ↑                                    release candidate
  │
develop ───────────────────────────── active development (preview URL)
  ↑
  ├── feature/smart-intake
  ├── feature/payment-abstraction
  ├── bugfix/invoice-total-rounding
  └── hotfix/login-broken          ──→ (hotfix goes staging → main directly)
```

---

## Branch Definitions

### `main` — Production
- **Deploys to:** `redlined1.com` via Vercel
- **Protected:** No direct pushes. PRs only. Require approval.
- **Merges from:** `staging` (normal releases) or `hotfix/*` (emergencies)
- **Rule:** Every merge must have passed the full release checklist

### `staging` — Release Candidate
- **Deploys to:** `staging.redlined1.com`
- **Merges from:** `develop`, `feature/*`, `bugfix/*`
- **Rule:** Used for QA and D1 beta testing before production promotion
- **Reset policy:** May be rebased or reset if staging gets too far ahead — coordinate with team

### `develop` — Active Development
- **Deploys to:** Vercel preview URL
- **Merges from:** All `feature/*` and `bugfix/*` branches
- **Rule:** May be unstable. Never merge unreviewed code directly to staging.

### `feature/name` — Feature Work
- **Branch from:** `develop`
- **Merge to:** `develop` via PR
- **Naming:** `feature/epic-a2-deployment-pipeline`, `feature/smart-job-card`
- **Rule:** Must include a feature flag for any user-visible functionality

### `bugfix/name` — Non-Urgent Bug Fixes
- **Branch from:** `develop`
- **Merge to:** `develop` via PR
- **Naming:** `bugfix/invoice-tax-calculation`

### `hotfix/name` — Emergency Production Fixes
- **Branch from:** `main`
- **Merge to:** `staging` → test → `main` → backport to `develop`
- **Naming:** `hotfix/login-redirect-broken`
- **Rule:** Scope to the absolute minimum fix. Get it to staging first, even for 10 minutes.

---

## Commit Message Format

Use conventional commits for clarity in the changelog:

```
feat: add feature flag environment scoping
fix: correct invoice total rounding on tax-exempt items
chore: update .env.example with billing variables
docs: add release checklist
refactor: extract environment helpers to lib/environment.ts
hotfix: restore login redirect after auth callback
```

---

## Pull Request Rules

| PR target | Requires |
|---|---|
| `develop` | 1 approval, build passes |
| `staging` | 1 approval, build passes, staging DB migration ready |
| `main` | D1 owner approval, full release checklist, smoke test passed |

---

## Hotfix Flow

```
1. git checkout -b hotfix/description main
2. Make the minimum fix
3. git push origin hotfix/description
4. Open PR to staging → test on staging URL (even briefly)
5. Open PR from staging → main
6. D1 owner approves → merge
7. Vercel auto-deploys to production
8. Smoke test production
9. git checkout develop && git merge main  (backport the fix)
10. Write incident note (docs/incidents/)
```

---

## Branch Protection Setup (GitHub)

Set these in GitHub → Settings → Branches:

### `main`
- ✅ Require pull request before merging
- ✅ Require 1 approving review
- ✅ Require status checks to pass (Vercel build)
- ✅ Restrict who can push: owner + lead engineer only
- ✅ Do not allow force pushes

### `staging`
- ✅ Require pull request before merging
- ✅ Require 1 approving review

### `develop`
- ✅ Require pull request before merging (optional for solo work)
