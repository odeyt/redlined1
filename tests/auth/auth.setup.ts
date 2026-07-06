/**
 * Global auth setup — runs before all test suites.
 * Logs in as owner and saves cookies to tests/.auth/owner.json
 * so subsequent tests can skip the login step.
 */

import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../.auth/owner.json');

setup('authenticate as owner', async ({ page }) => {
  const email    = process.env.TEST_OWNER_EMAIL;
  const password = process.env.TEST_OWNER_PASSWORD;

  if (!email || !password) {
    console.warn('[setup] TEST_OWNER_EMAIL / TEST_OWNER_PASSWORD not set — skipping auth setup');
    return;
  }

  await page.goto('/login');
  await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });

  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('.login-btn');

  // Wait for redirect to dashboard
  await page.waitForURL('/', { timeout: 15_000 });
  await expect(page).toHaveURL('/');

  // Persist cookies + localStorage
  await page.context().storageState({ path: authFile });
  console.log('[setup] Auth saved to', authFile);
});
