# Redlined1 — Playwright Test Suite

## Overview

Release-validation workflow:

```
feature branch → Vercel Preview → Playwright smoke → pull request → production
```

Phase 1 covers the foundation: public-page smoke, login/protected-route tests,
dashboard load, and responsive checks across desktop/tablet/mobile.

---

## Local dev points at the STAGING database

`next dev` and the E2E harness both read `.env.development.local`, which
Next.js ranks above `.env.local`:

```
.env.development.local  >  .env.local  >  .env.development  >  .env
```

Copy `.env.development.local.example` to `.env.development.local` and fill in
your `redlined1-staging` Supabase values. Your production values in `.env.local`
are untouched and still used by builds and scripts. Delete the file to point
local dev back at production.

**Guard rail:** `tests/helpers/db-target.ts` refuses to create synthetic test
data when the target is the production project ref (`ldjrlvjkmzrcdqhetqoh`).
`npm run test:local` fails fast with instructions rather than writing to
production. Override deliberately with `ALLOW_PROD_E2E=true` — which
`npm run test:audit` sets, because that suite is read-only against production
by design.

Keep the staging schema in sync with production, or local tests validate
against a schema you no longer run:

```bash
npx supabase db dump --db-url "<PRODUCTION_URI>" --schema public -f /tmp/prod-schema.sql
npx supabase db reset --db-url "<STAGING_URI>"      # optional: start clean
psql "<STAGING_URI>" -f /tmp/prod-schema.sql
```

Both connection strings come from Supabase → Settings → Database → Connection
string → URI. Paste passwords into your own terminal, never into chat.

---

## Quick start — local, self-contained

```bash
npx playwright install chromium   # first time only
npm run test:local
```

That is the whole setup. Playwright starts `next dev` itself (an already
running one is reused), so no second terminal is needed.

**What makes it safe to run against a real Supabase project:** each run
provisions its **own throwaway tenant** — a new owner account and a new shop —
does its work inside it, and deletes it afterwards. It never reads or writes an
existing shop's data. Synthetic accounts use the reserved
`@redlined1-e2e-test.invalid` domain (RFC 2606, guaranteed non-resolvable), so a
stray invite or notification can never reach a real person, and cleanup can
identify synthetic rows with no ambiguity.

If a run crashes before teardown, remove the leftovers with:

```bash
npm run test:sweep
```

The sweep matches only the `.invalid` domain and refuses to delete any account
that is not synthetic.

---

## Scripts

| Script | What it does |
|---|---|
| `npm run test:local` | Local suite, auto-starts dev server, own tenant |
| `npm run test:local:headed` | Same, with a visible browser |
| `npm run test:local:ui` | Playwright UI mode for debugging |
| `npm run test:sweep` | Delete synthetic data left by crashed runs |
| `npm run test:audit` | Authenticated audit suite (uses `.env.e2e.local`) |
| `npm run test:smoke` | Public `@smoke` tests |
| `npm run test:smoke:prod` | Public smoke against `https://www.redlined1.com` |
| `npm run test:unit` | Jest unit tests |
| `npm run test:report` | Open the last HTML report |

---

## Test modes

Set `TEST_MODE` to choose the target URL:

| Mode | URL | When |
|------|-----|------|
| `local` (default) | `http://localhost:3000` | Local dev |
| `preview` | `$VERCEL_PREVIEW_URL` | GitHub Actions on PR |
| `production` | `https://www.redlined1.com` | Manual smoke post-deploy |

```bash
# Preview mode
TEST_MODE=preview VERCEL_PREVIEW_URL=https://redlined1-abc123.vercel.app \
  npx playwright test --project=smoke-chromium

# Production smoke
TEST_MODE=production npx playwright test --project=smoke-chromium
```

---

## NPM scripts

| Script | What it runs |
|--------|-------------|
| `npm run test:e2e` | Full suite, Chromium |
| `npm run test:smoke` | @smoke tests only, no auth required |
| `npm run test:visual` | Visual regression |
| `npm run test:headed` | Full suite with browser visible |
| `npm run test:ci` | CI mode (list + junit + html reporters) |

---

## Project structure

```
tests/
  smoke/
    public-pages.spec.ts   ← public routes, no auth, @smoke
    dashboard.spec.ts      ← dashboard + Command Center load, @smoke
    responsive.spec.ts     ← desktop/tablet/mobile viewport checks, @smoke
  auth/
    auth.setup.ts          ← saves owner session to .auth/owner.json
    login.spec.ts          ← auth flows
  responsive/
    responsive.spec.ts     ← full mobile suite, @mobile
  marketing/
    landing-preview.spec.ts
  helpers/
    auth.ts                ← login/logout/navigateTo helpers
    api.ts                 ← API test helpers
    cleanup.ts             ← test data cleanup
  fixtures/
    index.ts               ← ownerPage, technicianPage fixtures
  .auth/                   ← gitignored, created by auth.setup.ts
  reports/                 ← gitignored, HTML + JSON + JUnit output
  screenshots/             ← gitignored, failure screenshots
```

---

## GitHub Actions

### Preview validation (automatic)

`.github/workflows/preview-validation.yml`

Triggers on every PR targeting `main`. Waits for the Vercel preview deployment,
then runs `@smoke` tests against the preview URL.

**Secrets required in GitHub repo settings:**
- `VERCEL_TOKEN` — Vercel personal access token

### Production smoke (manual)

`.github/workflows/production-smoke.yml`

Triggered manually via GitHub Actions → "Run workflow". Run after confirming
a production deploy is live.

No secrets required beyond `GITHUB_TOKEN` (automatic).

---

## Auth state

The `setup` project runs `tests/auth/auth.setup.ts` first, which logs in as
the owner and saves cookies to `tests/.auth/owner.json`. All authenticated
projects depend on `setup`.

Smoke tests (`smoke-chromium` project) do **not** depend on `setup` — they must
work against any deployment without credentials.

Set credentials via env vars:

```bash
export TEST_OWNER_EMAIL=info@redlined1.com
export TEST_OWNER_PASSWORD=yourpassword
```

Or create a `.env.test` file (gitignored):

```
TEST_OWNER_EMAIL=info@redlined1.com
TEST_OWNER_PASSWORD=yourpassword
```

---

## Artifacts

| Path | Contents |
|------|----------|
| `tests/reports/html/` | Interactive HTML report |
| `tests/reports/results.json` | JSON results |
| `tests/reports/results.xml` | JUnit XML (CI integration) |
| `tests/screenshots/` | Failure screenshots, traces, videos |

---

## Adding tests

- Tag tests with `@smoke` if they must work without authentication.
- Tag with `@mobile` for mobile-only tests.
- Tag with `@cross-browser` for Firefox/WebKit runs.
- All smoke tests must tolerate being run against production (no writes, no deletes).
