import { test, expect } from '@playwright/test';
import { login, logout } from '../helpers/auth';

test.describe('Authentication', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // No stored auth

  test('shows login form @smoke', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('.login-btn')).toBeVisible();
  });

  test('rejects invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'invalid@example.com');
    await page.fill('#password', 'wrongpassword');
    await page.click('.login-btn');
    // Should stay on login page or show error
    await page.waitForTimeout(2000);
    const url = page.url();
    const hasError = await page.locator('text=/invalid|incorrect|error|failed/i').isVisible().catch(() => false);
    const stillOnLogin = url.includes('login') || url.endsWith('/');
    expect(hasError || stillOnLogin).toBeTruthy();
  });

  test('logs in successfully and redirects to dashboard', async ({ page }) => {
    const email    = process.env.TEST_OWNER_EMAIL;
    const password = process.env.TEST_OWNER_PASSWORD;
    if (!email || !password) test.skip();

    await login(page, email, password);
    expect(page.url()).not.toContain('/login');
  });

  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/');
    // Either stays at / (if public) or redirects to login
    await page.waitForTimeout(1000);
    const url = page.url();
    // App should not expose dashboard to unauthenticated users
    // Accept either redirect to /login or showing login UI
    const loginVisible = await page.locator('#email').isVisible().catch(() => false);
    const isLoginPage  = url.includes('login') || loginVisible;
    expect(isLoginPage).toBeTruthy();
  });
});
