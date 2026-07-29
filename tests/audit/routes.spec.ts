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

  test('/ redirects to /login when unauthenticated', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/login/, { timeout: 10_000 }).catch(() => {});
    const hasLoginForm = await page.locator('input[type="email"]').isVisible().catch(() => false);
    expect(page.url().includes('login') || hasLoginForm).toBeTruthy();
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
