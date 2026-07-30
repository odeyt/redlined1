/**
 * Security regression: a user must never see data or branding for a shop they
 * are not a member of, even if that shop's id is left in localStorage by a
 * previous session on the same browser.
 *
 * Reproduces the reported bug: a trial user saw "D1 IMPORTS - LOCATION 2"
 * branding and D1's sidebar counts (158 parts, 24 repair orders, …).
 *
 * NOTE: the foreign id is planted with a one-time evaluate() rather than
 * addInitScript(), because an init script re-plants on every navigation —
 * including the reload the app performs while correcting the active shop —
 * which would make the assertion unfalsifiable.
 */
import { test, expect } from '@playwright/test';
import path from 'path';

const D1_LOCATION_2 = '90b72748-bf01-4456-999f-f4ba48091606';

test.use({ storageState: path.join(__dirname, '../.auth/audit-user.json') });

test('stale foreign shop id is discarded and no D1 data is shown', async ({ page }) => {
  // Establish origin, then plant the foreign shop id exactly once.
  await page.goto('/login');
  await page.evaluate(id => localStorage.setItem('activeShopId', id), D1_LOCATION_2);

  await page.goto('/');
  await expect(page.locator('.sidebar, aside').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(5000); // shop resolution, any self-correcting reload, counts

  // The planted shop must not still be the active one.
  const cached = await page.evaluate(() => localStorage.getItem('activeShopId'));
  expect(cached ?? '').not.toBe(D1_LOCATION_2);

  // No D1 branding leaked into the shell.
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('D1 IMPORTS');
  expect(body).not.toContain('D1 Imports');

  // The sidebar must not show D1's counts. 158 parts is the signature figure
  // from the bug report and cannot occur in this account's own tiny dataset.
  // (Own-shop badges are expected to be non-zero, so "all zeros" is the wrong
  // assertion here — isolation of D1's rows is asserted in rls-cross-shop.spec.)
  const sidebar = await page.locator('.sidebar, aside').first().innerText();
  expect(sidebar, 'sidebar shows D1 parts count — cross-shop leak').not.toMatch(/\b158\b/);
});
