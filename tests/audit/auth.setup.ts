/**
 * Auth setup for the E2E audit user.
 * Reads credentials from .env.e2e.local (gitignored).
 * Run: npx playwright test tests/audit/auth.setup.ts --project=setup
 */
import { test as setup, expect } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.e2e.local') });

export const auditAuthFile = path.join(__dirname, '../.auth/audit-user.json');

setup('authenticate as audit user', async ({ page }) => {
  const email    = process.env.E2E_TRIAL_USER_EMAIL;
  const password = process.env.E2E_TRIAL_USER_PASSWORD;

  if (!email || !password) {
    console.warn('[audit-setup] E2E_TRIAL_USER_EMAIL / E2E_TRIAL_USER_PASSWORD not set — skipping');
    return;
  }

  await page.goto('/login');
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 });

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Must reach app shell — not stay on /login
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 20_000 });
  expect(page.url()).not.toContain('/login');

  await page.context().storageState({ path: auditAuthFile });
  console.log('[audit-setup] Auth saved for audit user');
});
