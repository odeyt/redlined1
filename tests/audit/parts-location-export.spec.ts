/**
 * Verifies the Parts Inventory location quick-pick chips and Export CSV.
 * Seed data: E2E-BRK-001 (Shop 1) and E2E-FLT-002 (Shop 2) in E2E Audit Shop.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.use({ storageState: path.join(__dirname, '../.auth/audit-user.json') });

async function openParts(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.locator('.sidebar, aside').first()).toBeVisible({ timeout: 20_000 });
  await page.locator('.sidebar button, aside button, .sidebar a, aside a')
    .filter({ hasText: /parts inventory/i }).first().click();
  await page.waitForTimeout(1500);
}

test('search by location filters the list', async ({ page }) => {
  await openParts(page);
  const search = page.getByPlaceholder(/Search part #/i);
  await search.fill('Shop 1');
  await page.waitForTimeout(500);
  await expect(page.getByText('E2E-BRK-001')).toBeVisible();
  await expect(page.getByText('E2E-FLT-002')).not.toBeVisible();
});

test('Export CSV downloads the filtered list', async ({ page }) => {
  await openParts(page);
  await page.getByPlaceholder(/Search part #/i).fill('Shop 1');
  await page.waitForTimeout(500);

  const downloadPromise = page.waitForEvent('download', { timeout: 10_000 });
  await page.getByRole('button', { name: /Export CSV/i }).click();
  const download = await downloadPromise;

  const file = await download.path();
  const csv = fs.readFileSync(file, 'utf8');
  expect(csv).toContain('part_number');
  expect(csv).toContain('E2E-BRK-001');
  expect(csv).not.toContain('E2E-FLT-002'); // filtered out
});

test('Add Part form shows quick-pick chips for existing locations', async ({ page }) => {
  await openParts(page);
  await page.getByRole('button', { name: /\+ Add Part/i }).click();
  await page.waitForTimeout(800);
  // Chips derived from seeded parts
  await expect(page.getByRole('button', { name: '+ Shop 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Shop 2' })).toBeVisible();
  // Clicking a chip assigns the location
  await page.getByRole('button', { name: '+ Shop 1' }).click();
  await expect(page.getByText('📍 Shop 1')).toBeVisible();
});
