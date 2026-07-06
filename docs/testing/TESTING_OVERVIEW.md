# Testing Overview

RedlineD1 uses Playwright for automated end-to-end regression testing. Every deployment to staging
should run the full suite before promotion to production.

## Quick start

```bash
# Install browser binaries (first time only)
npx playwright install --with-deps chromium

# Set credentials (staging only — never production)
export TEST_OWNER_EMAIL=owner@yourshop.com
export TEST_OWNER_PASSWORD=yourpassword
export TEST_BASE_URL=http://localhost:3000

# Run full suite
npm run test:e2e

# Run smoke tests only (fastest)
npm run test:smoke

# Run with browser visible
npm run test:headed

# Run visual regression
npm run test:visual
```

## Test structure

```
tests/
├── .auth/              # Saved session cookies (gitignored)
├── auth/               # Login / logout tests
├── customers/          # Customer CRUD
├── vehicles/           # Vehicle CRUD + VIN
├── jobcards/           # Job card creation
├── estimates/          # Estimate line items + approval
├── repair-orders/      # RO status + assignment
├── invoices/           # Invoice totals + taxes
├── payments/           # Payment recording
├── feature-flags/      # Flag evaluation + toggle
├── system-health/      # Health endpoint + UI
├── repair-intelligence/# RI module (feature-flagged)
├── visual/             # Screenshot baseline tests
├── performance/        # Load time budgets
├── helpers/            # auth.ts, api.ts, cleanup.ts
├── fixtures/           # Shared test data constants
└── reports/            # HTML, JSON, JUnit output
```

## Tags

- `@smoke`         — fastest critical path, run on every PR
- `@visual`        — screenshot comparison, run on visual changes
- `@cross-browser` — firefox + webkit, run weekly
- `@mobile`        — mobile viewport tests

## Environment variables

| Variable              | Required | Description                        |
|-----------------------|----------|------------------------------------|
| TEST_OWNER_EMAIL      | Yes      | Owner account email (staging only) |
| TEST_OWNER_PASSWORD   | Yes      | Owner account password             |
| TEST_BASE_URL         | No       | Defaults to http://localhost:3000  |
| TEST_TECH_EMAIL       | No       | Technician account for role tests  |
| TEST_TECH_PASSWORD    | No       | Technician password                |
