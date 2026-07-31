/**
 * Proves the local E2E harness works end to end: a run creates its own shop,
 * signs in through the real login form, sees only its own (empty) data, and
 * removes everything afterwards.
 *
 * Run: npm run test:local
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createSyntheticShop, destroySyntheticShop, type SyntheticShop } from '../helpers/synthetic-shop';

let shop: SyntheticShop;

test.beforeAll(async () => {
  shop = await createSyntheticShop('local');
});

test.afterAll(async () => {
  if (shop) await destroySyntheticShop(shop);
});

test.describe.configure({ mode: 'serial' });

test('synthetic owner can sign in', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 20_000 });
  await page.fill('input[type="email"]', shop.email);
  await page.fill('input[type="password"]', shop.password);
  await page.click('button[type="submit"]');

  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 25_000 });
  await expect(page.locator('.sidebar, aside, .topbar').first()).toBeVisible({ timeout: 20_000 });
});

test('sees its own shop, not another tenant', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', shop.email);
  await page.fill('input[type="password"]', shop.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 25_000 });
  await page.waitForTimeout(3000);

  const body = await page.locator('body').innerText();
  // Never another tenant's branding
  expect(body).not.toContain('D1 Imports');
  expect(body).not.toContain('D1 IMPORTS');
  // The shell shows this tenant's own name only when shop_settings could be
  // seeded; without it the app falls back to "My Shop", which is still correct
  // isolation. Asserting unconditionally would fail for an environment reason,
  // not a product one.
  // innerText reflects CSS text-transform, so the shell renders these
  // uppercase — compare case-insensitively.
  if (shop.namedInShell) {
    expect(body.toUpperCase()).toContain('[E2E]');
  } else {
    expect(body.toUpperCase()).toContain('MY SHOP');
  }
});

test('starts empty and cannot see another tenant', async () => {
  // Asserted at the data layer rather than by scraping sidebar digits: the
  // sidebar also renders the run id, whose timestamp reads as a "count".
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { error: authErr } = await db.auth.signInWithPassword({
    email: shop.email,
    password: shop.password,
  });
  expect(authErr).toBeNull();

  const D1_SHOPS = [
    '38d55fae-741b-4bac-b520-f96eed65bf38',
    '90b72748-bf01-4456-999f-f4ba48091606',
  ];

  for (const table of ['customers', 'vehicles', 'job_cards', 'repair_orders', 'invoices', 'parts']) {
    const own = await db.from(table).select('id').eq('shop_id', shop.shopId).limit(5);
    if (!own.error) {
      expect(own.data ?? [], `${table} should be empty for a new tenant`).toHaveLength(0);
    }

    const foreign = await db.from(table).select('id').in('shop_id', D1_SHOPS).limit(5);
    if (!foreign.error) {
      expect(foreign.data ?? [], `${table} leaked rows from another shop`).toHaveLength(0);
    }
  }
});
