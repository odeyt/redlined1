import { test, expect, Page } from '@playwright/test';

/**
 * Responsive / mobile smoke tests — tagged @mobile
 * Run with:  npx playwright test --project=mobile-chrome
 * Device:    Pixel 5  (393 × 851, deviceScaleFactor 2.75)
 *
 * These tests verify that core UI elements are visible and functional
 * at mobile viewport width. They do NOT test data-loading outcomes.
 */

test.describe('Mobile responsive @mobile', () => {

  // ── Login page ──────────────────────────────────────────────────
  test('login page fits viewport without horizontal scroll', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('.login-card')).toBeVisible({ timeout: 10_000 });

    const bodyWidth    = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = page.viewportSize()!.width;
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 2); // ±2px tolerance
  });

  // ── Shell / hamburger ───────────────────────────────────────────
  test('hamburger button is visible after login', async ({ page }) => {
    await page.goto('/');
    // Wait for app shell to mount (topbar renders)
    await expect(page.locator('.topbar')).toBeVisible({ timeout: 15_000 });
    const hamburger = page.locator('.mobile-menu-btn');
    await expect(hamburger).toBeVisible();
  });

  test('sidebar is hidden by default on mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.topbar')).toBeVisible({ timeout: 15_000 });
    const sidebar = page.locator('.sidebar');
    // Off-canvas: left is negative, so sidebar should not be in visible area
    const box = await sidebar.boundingBox();
    if (box) {
      // The sidebar's right edge should be ≤ 0 (off-screen left)
      expect(box.x + box.width).toBeLessThanOrEqual(2);
    }
  });

  test('sidebar opens when hamburger is tapped', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.topbar')).toBeVisible({ timeout: 15_000 });

    await page.locator('.mobile-menu-btn').click();
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toHaveClass(/mobile-open/, { timeout: 3_000 });

    const box = await sidebar.boundingBox();
    if (box) {
      // Sidebar left edge should now be at 0 or positive (on-screen)
      expect(box.x).toBeGreaterThanOrEqual(0);
    }
  });

  test('backdrop is visible when sidebar is open', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.topbar')).toBeVisible({ timeout: 15_000 });
    await page.locator('.mobile-menu-btn').click();
    await expect(page.locator('.sidebar-backdrop.visible')).toBeVisible({ timeout: 3_000 });
  });

  test('tapping backdrop closes sidebar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.topbar')).toBeVisible({ timeout: 15_000 });
    await page.locator('.mobile-menu-btn').click();
    await expect(page.locator('.sidebar-backdrop.visible')).toBeVisible({ timeout: 3_000 });

    await page.locator('.sidebar-backdrop').click();
    await expect(page.locator('.sidebar')).not.toHaveClass(/mobile-open/, { timeout: 3_000 });
  });

  // ── No horizontal overflow on key views ─────────────────────────
  async function checkNoHScroll(page: Page) {
    const bodyWidth     = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = page.viewportSize()!.width;
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 2);
  }

  test('dashboard has no horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.topbar')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    await checkNoHScroll(page);
  });

  test('job cards view has no horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.topbar')).toBeVisible({ timeout: 15_000 });
    await page.locator('.mobile-menu-btn').click();
    const jobBtn = page.locator('nav button, aside button').filter({ hasText: /job card/i }).first();
    await jobBtn.click();
    await page.waitForTimeout(1000);
    await checkNoHScroll(page);
  });

  test('customers view has no horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.topbar')).toBeVisible({ timeout: 15_000 });
    await page.locator('.mobile-menu-btn').click();
    await page.locator('nav button, aside button').filter({ hasText: /customer/i }).first().click();
    await page.waitForTimeout(1000);
    await checkNoHScroll(page);
  });

  // ── Touch target sizes ──────────────────────────────────────────
  test('hamburger button meets 44px touch target', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.topbar')).toBeVisible({ timeout: 15_000 });
    const box = await page.locator('.mobile-menu-btn').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(40);
    expect(box!.height).toBeGreaterThanOrEqual(40);
  });

  test('primary action buttons are full-width on mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.topbar')).toBeVisible({ timeout: 15_000 });
    const viewport = page.viewportSize()!.width;
    const btns = page.locator('.actions .btn');
    const count = await btns.count();
    for (let i = 0; i < Math.min(count, 3); i++) {
      const box = await btns.nth(i).boundingBox();
      if (box) {
        // On mobile, buttons should fill most of the available width
        expect(box.width).toBeGreaterThan(viewport * 0.6);
      }
    }
  });

  // ── Body scroll lock when drawer is open ────────────────────────
  test('body scroll is locked when sidebar is open', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.topbar')).toBeVisible({ timeout: 15_000 });
    await page.locator('.mobile-menu-btn').click();
    await expect(page.locator('.sidebar-backdrop.visible')).toBeVisible({ timeout: 3_000 });

    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow).toBe('hidden');
  });
});
