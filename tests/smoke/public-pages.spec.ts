import { test, expect } from '@playwright/test';

/**
 * Public-page smoke tests — tagged @smoke
 * Run with:  npx playwright test --project=smoke-chromium
 *
 * These tests require NO authentication and must pass against local,
 * Vercel Preview, and production. Keep them fast and side-effect free.
 */

test.describe('Public pages @smoke', () => {

  test('login page loads and shows form', async ({ page }) => {
    const res = await page.goto('/login');
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('login page has no "trial" language', async ({ page }) => {
    await page.goto('/login');
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.toLowerCase()).not.toContain('7-day trial');
    expect(bodyText.toLowerCase()).not.toContain('free trial');
  });

  test('signup page loads and shows form', async ({ page }) => {
    const res = await page.goto('/signup');
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('signup page shows "Free forever" messaging', async ({ page }) => {
    await page.goto('/signup');
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.toLowerCase()).toContain('free forever');
    expect(bodyText.toLowerCase()).not.toContain('7-day');
  });

  test('unauthenticated / serves the marketing page, not the app shell', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    // By design / is the public marketing page with a Sign In link — it does
    // not redirect to /login. What matters is that the authenticated app shell
    // is never served to an anonymous visitor.
    const signIn = await page.getByRole('link', { name: /sign in/i }).first()
      .isVisible().catch(() => false);
    const hasLoginForm = await page.locator('input[type="email"]').isVisible().catch(() => false);
    expect(signIn || hasLoginForm || page.url().includes('login')).toBeTruthy();

    const appShell = await page.locator('.sidebar, .topbar').first().isVisible().catch(() => false);
    expect(appShell, 'app shell must not render for an unauthenticated visitor').toBeFalsy();
  });

  test('forgot-password page loads', async ({ page }) => {
    const res = await page.goto('/forgot-password');
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 });
  });

  test('page title is set and contains Redlined1', async ({ page }) => {
    await page.goto('/login');
    const title = await page.title();
    expect(title.toLowerCase()).toMatch(/redline/i);
  });

  test('no "D1 Imports" branding visible on public pages', async ({ page }) => {
    for (const path of ['/login', '/signup']) {
      await page.goto(path);
      const bodyText = await page.locator('body').innerText();
      expect(bodyText).not.toContain('D1 Imports');
      expect(bodyText).not.toContain('D1 IMPORTS');
    }
  });

});
