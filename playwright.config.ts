import { defineConfig, devices } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';
import path from 'path';

// Load Supabase keys (needed by audit auth setup for API-based session injection)
loadDotenv({ path: path.resolve(__dirname, '.env.local') });
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
      grep: /@smoke/,
      use: { ...devices['Desktop Chrome'] },
      // No setup dependency — smoke tests must work without auth
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
});
