import { test, expect } from '@playwright/test';

/**
 * Dashboard and Command Center load tests
 * These run under the full chromium project (authenticated via storageState).
 * Tagged @smoke so they also run in the fast smoke pass when credentials are set.
 *
 * Run with:  npx playwright test tests/smoke/dashboard.spec.ts --project=chromium
 */

test.describe('Dashboard load @smoke', () => {

  test('/ loads and renders the shell', async ({ page }) => {
    await page.goto('/');
    // Sidebar or topbar must be present — confirms the app shell mounted
    const shell = page.locator('.sidebar, .topbar, [data-testid="sidebar"], nav');
    await expect(shell.first()).toBeVisible({ timeout: 20_000 });
  });

  test('dashboard has no "D1 Imports" branding', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000); // allow async shop name to resolve
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('D1 Imports');
    expect(bodyText).not.toContain('D1 IMPORTS');
  });

  test('dashboard tiles are visible (not blank)', async ({ page }) => {
    await page.goto('/');
    const shell = page.locator('.sidebar, .topbar');
    await expect(shell.first()).toBeVisible({ timeout: 20_000 });
    // At least one module tile or nav item should be visible
    const tiles = page.locator(
      '[data-module], .module-tile, .nav-item, .sidebar-item, aside a, nav a'
    );
    await expect(tiles.first()).toBeVisible({ timeout: 10_000 });
  });

});

test.describe('Command Center load @smoke', () => {

  test('Command Center opens at /', async ({ page }) => {
    await page.goto('/');
    const shell = page.locator('.sidebar, .topbar, [data-testid="sidebar"]');
    await expect(shell.first()).toBeVisible({ timeout: 20_000 });
    // Command Center is the default home — page should not redirect to /login
    expect(page.url()).not.toContain('/login');
  });

  test('sidebar navigation links are rendered', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.sidebar, aside').first()).toBeVisible({ timeout: 15_000 });
    const links = page.locator('.sidebar a, aside a, .sidebar button, aside button');
    const count = await links.count();
    expect(count).toBeGreaterThan(2);
  });

});

test.describe('Protected route redirect @smoke', () => {

  test('unauthenticated access to / redirects to login', async ({ browser }) => {
    // Fresh context — no stored credentials
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForURL(/login/, { timeout: 10_000 }).catch(() => {});
    const url = page.url();
    const hasLoginInput = await page.locator('input[type="email"]').isVisible().catch(() => false);
    expect(url.includes('login') || hasLoginInput).toBeTruthy();
    await ctx.close();
  });

});
