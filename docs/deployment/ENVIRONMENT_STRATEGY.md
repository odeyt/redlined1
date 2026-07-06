# Redlined1 — Environment Strategy

## Overview

Redlined1 uses a three-environment pipeline to keep production safe while allowing active development and beta testing.

```
Local Development → Staging → Production
```

No experimental code, database migrations, or new features should go directly to production without passing through staging first.

---

## 1. Local Development

| Property | Value |
|---|---|
| Branch | `develop` or `feature/*` |
| URL | `http://localhost:3000` |
| Supabase | Separate dev project (`redlined1-dev`) or local Supabase CLI |
| Feature flags | `NEXT_PUBLIC_FEATURE_FLAGS_ENV=development` — experimental flags allowed |
| App env | `NEXT_PUBLIC_APP_ENV=development` |
| Env file | `.env.local` (copy from `.env.development.example`) |

**Rules:**
- Never use production Supabase credentials locally
- Never commit `.env.local`
- Experimental features may be enabled freely
- Console logs and debug output acceptable

---

## 2. Staging

| Property | Value |
|---|---|
| Branch | `staging` |
| URL | `staging.redlined1.com` or Vercel staging domain |
| Supabase | Separate staging project (`redlined1-staging`) |
| Feature flags | `NEXT_PUBLIC_FEATURE_FLAGS_ENV=staging` — experimental flags allowed when explicitly enabled |
| App env | `NEXT_PUBLIC_APP_ENV=staging` |
| Env file | Values set in Vercel dashboard for staging environment |

**Rules:**
- D1 Imports beta testing happens here
- No real customer payment data
- Migrations must be tested here before production
- Staging DB may be seeded with anonymized test data
- Feature flags off by default; QA team enables per-test

---

## 3. Production

| Property | Value |
|---|---|
| Branch | `main` |
| URL | `redlined1.com` |
| Supabase | Production project (`redlined1-prod`) |
| Feature flags | `NEXT_PUBLIC_FEATURE_FLAGS_ENV=production` — experimental flags disabled by default |
| App env | `NEXT_PUBLIC_APP_ENV=production` |
| Env file | Values set in Vercel dashboard for production environment |

**Rules:**
- Only stable, tested code
- All migrations pre-tested on staging
- Feature flags default to `false` unless explicitly enabled by owner
- No debug output
- RLS enforced at all times
- Supabase backup before every migration

---

## 4. Branch Strategy

```
main          ← production (protected, no direct push)
  ↑
staging       ← release candidate (PR from develop or feature branches)
  ↑
develop       ← active development (merge target for feature branches)
  ↑
feature/xyz   ← individual features
bugfix/xyz    ← bug fixes
hotfix/xyz    ← emergency production fixes (merges to staging → main)
```

See `GIT_BRANCHING_STRATEGY.md` for full rules.

---

## 5. Environment Variables

Each environment uses its own `.env` values. Templates:

| Template | Purpose |
|---|---|
| `.env.development.example` | Copy to `.env.local` for local dev |
| `.env.staging.example` | Reference for Vercel staging env vars |
| `.env.production.example` | Reference for Vercel production env vars |

**Critical rule:** `SUPABASE_SERVICE_ROLE_KEY` must be different for each environment. Never use production service role key on staging or local.

---

## 6. Supabase Project Separation

| Environment | Project Name | Notes |
|---|---|---|
| Production | `redlined1-prod` | Real customer data, RLS enforced |
| Staging | `redlined1-staging` | Anonymized/test data only |
| Development | `redlined1-dev` | Throwaway data, local dev |

See `SUPABASE_ENVIRONMENT_GUIDE.md` for setup instructions.

---

## 7. Vercel Deployment Separation

| Environment | Git Branch | Vercel Project / Domain |
|---|---|---|
| Production | `main` | `redlined1` → `redlined1.com` |
| Staging | `staging` | `redlined1-staging` → `staging.redlined1.com` |
| Development | `develop` | Vercel preview deployments |

See `VERCEL_DEPLOYMENT_GUIDE.md` for setup instructions.

---

## 8. Feature Flag Behavior Per Environment

The feature flag system (`lib/featureFlags/`) respects the current environment:

| Environment | Default flag state | Experimental flags |
|---|---|---|
| `development` | `false` unless enabled | Freely allowed |
| `staging` | `false` unless enabled | Allowed with explicit enable |
| `production` | `false` always for new flags | Disabled by default |

Flag evaluation priority: `user > role > shop > environment > global`

Environment-scoped flags (`scope=environment`) allow enabling a flag only on staging without touching production.

---

## 9. Rollback Strategy

1. **Vercel rollback** — instant: promote previous deployment in Vercel dashboard
2. **Feature flag rollback** — instant: toggle flag off in Settings → Feature Flags
3. **Database rollback** — requires pre-migration backup restore (see `ROLLBACK_GUIDE.md`)

---

## 10. Release Checklist

See `RELEASE_CHECKLIST.md` for the full pre-merge, pre-production, and post-deploy checklist.
