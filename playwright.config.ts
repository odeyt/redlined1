import { defineConfig, devices } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';
import path from 'path';

// Read before any dotenv call — shell vars are already present.
const EARLY_MODE = process.env.TEST_MODE ?? 'local';

// Load Supabase keys (needed by audit auth setup for API-based session injection)
loadDotenv({ path: path.resolve(__dirname, '.env.local') });

// Local runs only: mirror Next.js precedence, where .env.development.local
// overrides .env.local for `next dev`. This is how local runs get pointed at
// the staging database — the harness must resolve the same project as the dev
// server it starts, or it would seed one database and assert against another.
// Deliberately NOT loaded for preview/production runs: the audit suite targets
// production and authenticates as an account that exists only there.
if (EARLY_MODE === 'local') {
  loadDotenv({ path: path.resolve(__dirname, '.env.development.local'), override: true });
}

// Load audit credentials — overrides take precedence, gitignored
loadDotenv({ path: path.resolve(__dirname, '.env.e2e.local'), override: true });

/**
 * TEST_MODE controls which URL the suite targets:
 *   local      → http://localhost:3000          (default)
 *   preview    → $VERCEL_PREVIEW_URL            (GitHub Actions on PR)
 *   production → https://www.redlined1.com      (manually triggered smoke)
 */
const MODE = (process.env.TEST_MODE ?? 'local') as 'local' | 'preview' | 'production';

const BASE_URL =
  MODE === 'production'
    ? 'https://www.redlined1.com'
    : MODE === 'preview'
    ? (process.env.VERCEL_PREVIEW_URL ?? process.env.TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000')
    : (process.env.TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000');

// Start a dev server only when the resolved target actually IS localhost.
// Keying this off MODE alone was wrong: .env.e2e.local can set
// PLAYWRIGHT_BASE_URL to production while MODE still defaults to 'local',
// which would boot a needless dev server for a production run.
const NEEDS_DEV_SERVER = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE_URL);

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,          // Sequential — shared Supabase state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['list'],
    ['html',  { outputFolder: 'tests/reports/html', open: 'never' }],
    ['json',  { outputFile: 'tests/reports/results.json' }],
    ['junit', { outputFile: 'tests/reports/results.xml' }],
  ],

  use: {
    baseURL:    BASE_URL,
    trace:      'on-first-retry',
    screenshot: 'only-on-failure',
    video:      'retain-on-failure',
    actionTimeout:     15_000,
    navigationTimeout: 20_000,
    // Preview deployments sit behind Vercel's deployment protection wall
    // (401 to any request without this header) — only sent for preview
    // runs, and only if the secret is actually configured, so local and
    // production runs (neither protected) are never affected.
    ...(MODE === 'preview' && process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } }
      : {}),
  },

  outputDir: 'tests/screenshots',

  projects: [
    // ── Auth setup (runs first, saves cookies) ───────────────────────────────
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },

    // ── Smoke: public pages only, no auth — runs against preview & production ─
    {
      name: 'smoke-chromium',
      // Scoped to tests/smoke: several files under tests/intelligence/ are named
      // *.spec.ts but are plain scripts that assert at import time and print
      // their own results. Without this they load into every unscoped project,
      // and one of them fails on a source-code check that has nothing to do with
      // the deployed site — which would break the production-smoke workflow.
      testMatch: /tests[/\\]smoke[/\\].*\.spec\.ts/,
      grep: /@smoke/,
      use: { ...devices['Desktop Chrome'] },
      // No setup dependency — smoke tests must work without auth
    },

    // ── Local: self-provisioning tenant, safe against any database ──────────
    // Creates its own throwaway shop + owner, works inside it, deletes it after.
    // Never reads or writes an existing tenant's data.
    {
      name: 'local',
      testMatch: /tests[/\\]local[/\\].*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // ── Audit: trial/free account E2E audit ─────────────────────────────────
    {
      name: 'audit-setup',
      testMatch: /tests\/audit\/auth\.setup\.ts/,
    },
    {
      name: 'audit',
      testMatch: /tests\/audit\/(?!auth\.setup).*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/audit-user.json',
      },
      dependencies: ['audit-setup'],
    },

    // ── Full regression suite ────────────────────────────────────────────────
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/owner.json',
      },
      dependencies: ['setup'],
      grepInvert: /@visual/,
      // tests/marketing covers the public, unauthenticated /landing-preview
      // route and runs standalone under the "marketing" project instead.
      testIgnore: /tests\/marketing\//,
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'tests/.auth/owner.json',
      },
      dependencies: ['setup'],
      grep: /@cross-browser/,
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: 'tests/.auth/owner.json',
      },
      dependencies: ['setup'],
      grep: /@cross-browser/,
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        storageState: 'tests/.auth/owner.json',
      },
      dependencies: ['setup'],
      grep: /@mobile/,
    },

    // ── Visual regression ────────────────────────────────────────────────────
    {
      name: 'visual',
      grep: /@visual/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/owner.json',
      },
      dependencies: ['setup'],
    },

    // ── Marketing / landing-preview: public routes only, no auth needed ──────
    {
      name: 'marketing',
      testMatch: /tests\/marketing\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Local runs manage their own dev server; preview/production target a
  // deployment that already exists. reuseExistingServer means an already-running
  // `npm run dev` is reused instead of failing on the port.
  webServer: NEEDS_DEV_SERVER
    ? {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      }
    : undefined,
});
