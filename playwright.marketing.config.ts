/**
 * Marketing capture — a separate Playwright configuration, used ONLY when named.
 *
 *   npx playwright test --config playwright.marketing.config.ts --project marketing-capture
 *
 * playwright.config.ts never references this file, and nothing under
 * tests/marketing-capture/ matches any project there (no *.spec.ts / *.test.ts,
 * no auth.setup.ts, and the `marketing` project's pattern requires
 * `tests/marketing/`, not `tests/marketing-capture/`). `npm test`, CI and deploy
 * checks therefore cannot run it. lib/marketing-capture/__tests__ asserts all of
 * that against the real config text.
 *
 * It records PRODUCTION inside one demo tenant, so:
 *   - the base URL is fixed here, not read from the environment. .env.e2e.local
 *     sets PLAYWRIGHT_BASE_URL and is deliberately NOT loaded;
 *   - one worker and zero retries: a failed run must never repeat status changes;
 *   - it refuses to load under CI at all;
 *   - service workers are blocked: their requests would bypass the request
 *     ledger's context.route, and no push subscription can be created.
 * The safety gates that decide whether a run may start live in
 * lib/marketing-capture/gates.ts.
 */
import { defineConfig, devices } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';
import path from 'path';

if (process.env.CI) {
  throw new Error('[marketing-capture] refusing to run under CI: this configuration records production.');
}

// Service-role key only, for the READ-ONLY gate queries.
loadDotenv({ path: path.resolve(__dirname, '.env.local') });

export const MARKETING_BASE_URL = 'https://www.redlined1.com';
const HD = { width: 1920, height: 1080 };

export default defineConfig({
  testDir: './tests/marketing-capture',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 6 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  // Test artefacts land under the gitignored output folder, never tests/screenshots.
  outputDir: 'marketing-output/.playwright',

  use: {
    baseURL: MARKETING_BASE_URL,
    headless: false,
    viewport: HD,
    deviceScaleFactor: 1,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },

  projects: [
    {
      // Logs in once, off camera, and saves tests/.auth/marketing-demo.json.
      name: 'marketing-prepare',
      testMatch: /demo-session\.prepare\.ts$/,
      use: { ...devices['Desktop Chrome'], viewport: HD, video: 'off', serviceWorkers: 'block' },
    },
    {
      // Never depends on marketing-prepare: the recording must not include a login.
      name: 'marketing-capture',
      testMatch: /\.capture\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: HD,
        deviceScaleFactor: 1,
        storageState: 'tests/.auth/marketing-demo.json',
        serviceWorkers: 'block',
        video: { mode: 'on', size: HD },
      },
    },
  ],
});
