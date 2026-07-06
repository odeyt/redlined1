import { test, expect } from '@playwright/test';
import { navigateTo } from '../helpers/auth';

const BUDGET_MS = {
  dashboard:    3000,
  customers:    3000,
  jobCards:     3000,
  estimates:    3000,
  health:       2000,
};

test.describe('Performance budgets', () => {
  test('dashboard loads within budget', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - start;
    console.log(`[perf] dashboard: ${elapsed}ms (budget ${BUDGET_MS.dashboard}ms)`);
    expect(elapsed).toBeLessThan(BUDGET_MS.dashboard);
  });

  test('customers list loads within budget', async ({ page }) => {
    await page.goto('/');
    const start = Date.now();
    await navigateTo(page, 'Customer');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - start;
    console.log(`[perf] customers: ${elapsed}ms (budget ${BUDGET_MS.customers}ms)`);
    expect(elapsed).toBeLessThan(BUDGET_MS.customers);
  });

  test('job cards list loads within budget', async ({ page }) => {
    await page.goto('/');
    const start = Date.now();
    await navigateTo(page, 'Job');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - start;
    console.log(`[perf] job-cards: ${elapsed}ms (budget ${BUDGET_MS.jobCards}ms)`);
    expect(elapsed).toBeLessThan(BUDGET_MS.jobCards);
  });

  test('/api/health responds within budget', async ({ request }) => {
    const start = Date.now();
    const res = await request.get('/api/health');
    const elapsed = Date.now() - start;
    console.log(`[perf] /api/health: ${elapsed}ms (budget ${BUDGET_MS.health}ms)`);
    expect(res.status()).toBe(200);
    expect(elapsed).toBeLessThan(BUDGET_MS.health);
  });
});
