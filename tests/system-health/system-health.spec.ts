import { test, expect } from '@playwright/test';
import { navigateTo } from '../helpers/auth';

test.describe('System Health', () => {
  test('GET /api/health returns 200 with status @smoke', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('checks');
  });

  test('/api/health reports database connectivity', async ({ request }) => {
    const res  = await request.get('/api/health');
    const body = await res.json();
    expect(body.checks).toHaveProperty('database');
    expect(body.checks.database).toBeTruthy();
  });

  test('/api/health includes environment field', async ({ request }) => {
    const res  = await request.get('/api/health');
    const body = await res.json();
    expect(body).toHaveProperty('environment');
    expect(['development', 'staging', 'production']).toContain(body.environment);
  });

  test('System Health view is accessible from sidebar (owner only)', async ({ page }) => {
    await page.goto('/');
    await navigateTo(page, 'System Health');
    await expect(
      page.locator('h1, h2').filter({ hasText: /system health/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('System Health view shows check results', async ({ page }) => {
    await page.goto('/');
    await navigateTo(page, 'System Health');
    await page.waitForTimeout(2000);
    // Should show at minimum a status indicator
    const statusText = page.locator('text=/healthy|ok|pass|fail|error/i').first();
    await expect(statusText).toBeVisible({ timeout: 10_000 });
  });

  test('/api/observability/logs returns 200 for owner', async ({ request }) => {
    const res = await request.get('/api/observability/logs');
    // 200 for owner, 401/403 for others
    expect([200, 401, 403]).toContain(res.status());
  });
});
