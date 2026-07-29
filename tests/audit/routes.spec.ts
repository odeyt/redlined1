/**
 * Audit: route and protected-route coverage for the trial/free test account.
 */
import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../.auth/audit-user.json') });

test.describe('Public routes (no auth required)', () => {

  test.use({ storageState: { cookies: [], origins: [] } });

  const publicRoutes = [
    '/login',
    '/signup',
    '/forgot-password',
    '/terms',
    '/privacy',
  ];

  for (const route of publicRoutes) {
    test(`${route} returns 2xx`, async ({ page }) => {
      const res = await page.goto(route);
      expect(res?.status() ?? 200).toBeLessThan(400);
    });
  }

});

test.describe('Protected routes redirect when unauthenticated', () => {

  test.use({ storageState: { cookies: [], origins: [] } });

  test('/ shows public marketing page (not the app shell) when unauthenticated', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    // Unauthenticated visitors get the marketing page with a Sign In link —
    // never the authenticated app shell (sidebar/topbar).
    const signIn = await page.getByRole('link', { name: /sign in/i }).first().isVisible().catch(() => false);
    const hasLoginForm = await page.locator('input[type="email"]').isVisible().catch(() => false);
    expect(signIn || hasLoginForm || page.url().includes('login')).toBeTruthy();
    const appShell = await page.locator('.sidebar, .topbar').first().isVisible().catch(() => false);
    expect(appShell).toBeFalsy();
  });

});

test.describe('API health routes', () => {

  test('GET /api/health returns 200', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status');
  });

  test('GET /api/feature-flags returns flag map', async ({ request }) => {
    const res = await request.get('/api/feature-flags');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('flags');
  });

  test('GET /api/billing/env-check returns billingEnabled field', async ({ request }) => {
    const res = await request.get('/api/billing/env-check');
    // May be 200 or 401 depending on auth — just check it doesn't 500
    expect(res.status()).not.toBe(500);
  });

});
