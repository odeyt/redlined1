/**
 * Verifies the Parts Inventory location quick-pick chips and Export CSV.
 *
 * Seeds its own parts (E2E-BRK-001 @ Shop 1, E2E-FLT-002 @ Shop 2) via the API
 * and removes them afterwards, so the suite does not depend on data left behind
 * by a previous run.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';

test.use({ storageState: path.join(__dirname, '../.auth/audit-user.json') });

const SHOP_ID = '22686099-9931-43a2-82b4-a12fe2d164cf'; // E2E Audit Shop
const SEED = ['E2E-BRK-001', 'E2E-FLT-002'];

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

async function signedInDb() {
  const c = db();
  const { error } = await c.auth.signInWithPassword({
    email:    process.env.E2E_TRIAL_USER_EMAIL!,
    password: process.env.E2E_TRIAL_USER_PASSWORD!,
  });
  if (error) throw new Error(`seed sign-in failed: ${error.message}`);
  return c;
}

test.beforeAll(async () => {
  const c = await signedInDb();
  const { data: { user } } = await c.auth.getUser();
  await c.from('parts').delete().eq('shop_id', SHOP_ID).in('part_number', SEED);
  const { error } = await c.from('parts').insert([
    { part_number: 'E2E-BRK-001', description: 'E2E Brake Pad', category: 'Brakes', cost: 10, retail: 20, quantity: 4, location: 'Shop 1', shop_id: SHOP_ID, owner_id: user!.id },
    { part_number: 'E2E-FLT-002', description: 'E2E Oil Filter', category: 'Other',  cost: 3,  retail: 8,  quantity: 9, location: 'Shop 2', shop_id: SHOP_ID, owner_id: user!.id },
  ]);
  if (error) throw new Error(`seeding parts failed: ${error.message}`);
});

test.afterAll(async () => {
  const c = await signedInDb();
  await c.from('parts').delete().eq('shop_id', SHOP_ID).in('part_number', SEED);
});

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
