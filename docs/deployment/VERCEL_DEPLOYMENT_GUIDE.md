# Redlined1 — Vercel Deployment Guide

## Overview

Redlined1 uses two Vercel projects:

| Project | Branch | Domain |
|---|---|---|
| `redlined1` (production) | `main` | `redlined1.com` |
| `redlined1-staging` | `staging` | `staging.redlined1.com` |

Preview deployments are generated automatically for any branch push.

---

## 1. Creating the Staging Project

### Option A — Separate Vercel Project (Recommended)

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import the same GitHub repo (`redlined1`)
3. Name it `redlined1-staging`
4. Under **Git Branch**, set deployment branch to `staging`
5. Set root directory (same as production)
6. Add all required environment variables (see Section 4)
7. Assign domain: `staging.redlined1.com`
   - Vercel dashboard → Domains → Add → `staging.redlined1.com`
   - Add CNAME in Namecheap: `staging` → Vercel provided target

### Option B — Vercel Preview Branch

1. In your existing production project → **Settings → Git**
2. Under **Preview Branches**, add `staging`
3. Vercel will auto-generate a URL like `redlined1-git-staging-xxx.vercel.app`
4. Assign a custom domain alias to that preview URL

---

## 2. Mapping Git Branches to Vercel Environments

| Branch | Vercel Environment | Notes |
|---|---|---|
| `main` | Production | Requires PR + review |
| `staging` | Staging (preview or separate project) | Release candidate |
| `develop` | Preview (auto URL) | Active development |
| `feature/*` | Preview (auto URL) | Per-PR preview |

In Vercel → **Settings → Environment Variables**, each variable can be scoped to:
- `Production` (main branch only)
- `Preview` (all non-main branches)
- `Development` (local `vercel dev`)

---

## 3. Recommended Branch → Environment Mapping

```
main     → Production   → redlined1.com
staging  → Staging      → staging.redlined1.com
develop  → Preview      → auto URL
```

Set this in each Vercel project under **Settings → Git → Production Branch**.

---

## 4. Required Environment Variables Per Environment

Set these in Vercel dashboard → **Settings → Environment Variables**.

### Both Staging and Production

```
NEXT_PUBLIC_SUPABASE_URL          ← DIFFERENT per environment
NEXT_PUBLIC_SUPABASE_ANON_KEY     ← DIFFERENT per environment
SUPABASE_SERVICE_ROLE_KEY         ← DIFFERENT per environment (never share)

RESEND_API_KEY                    ← Use different key or same (staging can share)
ANTHROPIC_API_KEY                 ← Can share across environments
AI_PROVIDER=anthropic
AI_MODEL=claude-haiku-4-5-20251001

PAYMENT_PROVIDER=creem
CREEM_API_KEY                     ← Use Creem test mode for staging
CREEM_WEBHOOK_SECRET              ← DIFFERENT — staging uses test endpoint
CREEM_SUCCESS_URL                 ← DIFFERENT — point to staging domain
CREEM_CANCEL_URL                  ← DIFFERENT — point to staging domain
CREEM_*_PRODUCT_ID                ← Use Creem test product IDs for staging
```

### Staging Only

```
NEXT_PUBLIC_APP_ENV=staging
NEXT_PUBLIC_APP_URL=https://staging.redlined1.com
NEXT_PUBLIC_FEATURE_FLAGS_ENV=staging
SENTRY_ENVIRONMENT=staging
```

### Production Only

```
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_APP_URL=https://redlined1.com
NEXT_PUBLIC_FEATURE_FLAGS_ENV=production
NEXT_PUBLIC_GA_ID=G-9QY4K8MZ1X
SENTRY_ENVIRONMENT=production
SENTRY_DSN=                       ← Add when Sentry is set up
```

---

## 5. Preview Deployment Rules

- Every PR to `staging` or `develop` generates a preview URL automatically
- Preview URLs are shareable with the team for review
- Preview deployments use **Preview** environment variables in Vercel
- Do NOT use production DB credentials for preview deployments

---

## 6. Promoting Staging to Production

```
1. Test on staging.redlined1.com — run full smoke test (SMOKE_TEST_PLAN.md)
2. Create PR: staging → main
3. Get approval from shop owner / lead
4. Backup production Supabase (Supabase dashboard → Backups)
5. Run any pending migrations on production Supabase SQL Editor
6. Merge PR → Vercel auto-deploys to production
7. Run smoke test on redlined1.com
8. Monitor error logs for 30 minutes
```

---

## 7. Rollback — Vercel

### Instant Rollback (< 2 minutes)

1. Vercel dashboard → `redlined1` project
2. **Deployments** tab
3. Find the previous successful deployment
4. Click **⋯ → Promote to Production**
5. Done — traffic switches immediately

### Branch Rollback

```bash
git revert HEAD        # creates a new commit reverting changes
git push origin main   # triggers new Vercel deploy
```

Do not force-push `main`.

---

## 8. Webhook Configuration After Deploy

After staging is live, register Creem webhook for the staging endpoint:

- Creem dashboard → Webhooks → Add endpoint
- URL: `https://staging.redlined1.com/api/webhooks/creem`
- Events: same as production

Production webhook URL: `https://redlined1.com/api/webhooks/creem`
