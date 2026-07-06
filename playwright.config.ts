import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

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

    // ── Smoke: Chromium only, fastest ────────────────────────────────────────
    {
      name: 'smoke-chromium',
      grep: /@smoke/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
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
  ],
});
