/**
 * Security regression: a user with no membership in a shop must never see that
 * shop's data or branding, even if that shop's id is left in localStorage by a
 * previous session on the same browser.
 *
 * Reproduces the reported bug: a trial user saw "D1 IMPORTS - LOCATION 2"
 * branding and D1's sidebar counts (158 parts, 24 repair orders, …).
 */
import { test, expect } from '@playwright/test';
import path from 'path';

const D1_LOCATION_2 = '90b72748-bf01-4456-999f-f4ba48091606';

test.use({ storageState: path.join(__dirname, '../.auth/audit-user.json') });

test('stale foreign shop id in localStorage is discarded, no D1 data shown', async ({ page }) => {
  // Plant a foreign shop id the way a previous session would have
  await page.addInitScript(id => {
    localStorage.setItem('activeShopId', id);
  }, D1_LOCATION_2);

  await page.goto('/');
  await expect(page.locator('.sidebar, aside').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(4000); // let shop resolution + counts settle

  // The planted shop id must have been cleared
  const cached = await page.evaluate(() => localStorage.getItem('activeShopId'));
  expect(cached ?? '').not.toBe(D1_LOCATION_2);

  // No D1 branding leaked into the shell
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('D1 IMPORTS');
  expect(body).not.toContain('D1 Imports');

  // Sidebar counts must all be zero for this empty account — the reported bug
  // showed D1's real counts (158 / 24 / 19 / …) here.
  const sidebar = await page.locator('.sidebar, aside').first().innerText();
  const counts = [...sidebar.matchAll(/\b(\d+)\b/g)].map(m => Number(m[1]));
  const nonZero = counts.filter(n => n > 0);
  expect(nonZero, `sidebar showed non-zero counts: ${nonZero.join(', ')}`).toHaveLength(0);
});
