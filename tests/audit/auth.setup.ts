/**
 * Auth setup for the E2E audit user — logs in through the real login form so
 * both cookies (SSR) and localStorage (client) are captured in storageState.
 *
 * Credentials come from .env.e2e.local, loaded by playwright.config.ts.
 * NOTE: values containing '#' must be quoted in the env file.
 */
import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

export const auditAuthFile = path.join(__dirname, '../.auth/audit-user.json');

setup('authenticate as audit user', async ({ page }) => {
  const email    = process.env.E2E_TRIAL_USER_EMAIL;
  const password = process.env.E2E_TRIAL_USER_PASSWORD;

  if (!email || !password) {
    console.warn('[audit-setup] E2E credentials not set — skipping');
    return;
  }

  await page.goto('/login');
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 });

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Must leave /login for the app shell
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 20_000 });
  expect(page.url()).not.toContain('/login');

  fs.mkdirSync(path.dirname(auditAuthFile), { recursive: true });
  await page.context().storageState({ path: auditAuthFile });
  console.log(`[audit-setup] Session saved for ${email}`);
});
