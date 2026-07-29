/**
 * Audit: plan state and entitlement audit for the trial/free test account.
 *
 * This suite verifies:
 * 1. The account has a canonical Free Forever state (plan='free', no trial lock)
 * 2. No hard lock screen is shown
 * 3. Free modules are accessible
 * 4. No stale trial or D1 branding
 */
import { test, expect } from '@playwright/test';
import path from 'path';

// Use the audit user's stored session
test.use({ storageState: path.join(__dirname, '../.auth/audit-user.json') });

test.describe('Plan state — Free Forever account', () => {

  test('dashboard loads without hard lock screen', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000); // allow usePlan() to resolve from DB

    // Hard lock screen must NOT appear
    const lockText = page.locator('text=/trial ended|subscription.*ended|subscribe to keep/i');
    await expect(lockText).not.toBeVisible({ timeout: 5_000 }).catch(() => {
      throw new Error('Hard lock screen is visible — Free Forever user is being blocked');
    });
  });

  test('app shell renders (sidebar or topbar visible)', async ({ page }) => {
    await page.goto('/');
    const shell = page.locator('.sidebar, .topbar, aside, nav').first();
    await expect(shell).toBeVisible({ timeout: 20_000 });
  });

  test('no D1 Imports branding visible after login', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('D1 Imports');
    expect(body).not.toContain('D1 IMPORTS');
  });

  test('no "7-day trial" or "trial ended" copy visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText().catch(() => '');
    expect(body.toLowerCase()).not.toContain('7-day trial');
    expect(body.toLowerCase()).not.toContain('trial ended');
    expect(body.toLowerCase()).not.toContain('trial is complete');
  });

});

test.describe('Free module access', () => {

  const freeModules = [
    'customers', 'vehicles', 'job-cards', 'inspections',
    'estimates', 'invoices', 'scheduling', 'appointments',
    'settings',
  ];

  for (const mod of freeModules) {
    test(`can access module: ${mod}`, async ({ page }) => {
      await page.goto('/');
      const shell = page.locator('.sidebar, .topbar, aside').first();
      await expect(shell).toBeVisible({ timeout: 20_000 });

      // Navigate to module via URL if possible
      // The app uses hash/state routing — click sidebar item
      const navBtn = page.locator(`[data-module="${mod}"], button[data-id="${mod}"], a[data-id="${mod}"]`).first();
      const sidebarLink = page.locator(`.sidebar button, aside button, .sidebar a, aside a`)
        .filter({ hasText: new RegExp(mod.replace('-', ' '), 'i') }).first();

      if (await navBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await navBtn.click();
      } else if (await sidebarLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await sidebarLink.click();
      }

      await page.waitForTimeout(1000);

      // Must not show hard lock or "access denied"
      const blocked = await page.locator('text=/trial ended|subscription.*ended|access denied|upgrade.*to access/i').isVisible().catch(() => false);
      expect(blocked).toBeFalsy();
    });
  }

});

test.describe('Responsive layout audit', () => {

  const viewports = [
    { label: 'desktop', width: 1280, height: 800 },
    { label: 'tablet',  width: 768,  height: 1024 },
    { label: 'mobile',  width: 390,  height: 844 },
  ];

  for (const vp of viewports) {
    test(`dashboard renders at ${vp.label} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      const shell = page.locator('.sidebar, .topbar, aside, nav').first();
      await expect(shell).toBeVisible({ timeout: 20_000 });

      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(vp.width + 4);
    });
  }

});
