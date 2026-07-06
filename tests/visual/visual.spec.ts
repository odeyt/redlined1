import { test, expect } from '@playwright/test';
import { navigateTo } from '../helpers/auth';

/**
 * Visual regression tests — tagged @visual
 * Run with: npx playwright test --project=visual
 * On first run, snapshots are created. On subsequent runs, diffs are checked.
 */

test.describe('Visual regression @visual', () => {
  test('dashboard screenshot baseline', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000); // Let data load
    await expect(page).toHaveScreenshot('dashboard.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: false,
    });
  });

  test('customers list screenshot baseline', async ({ page }) => {
    await page.goto('/');
    await navigateTo(page, 'Customer');
    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot('customers-list.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: false,
    });
  });

  test('job cards list screenshot baseline', async ({ page }) => {
    await page.goto('/');
    await navigateTo(page, 'Job');
    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot('job-cards-list.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: false,
    });
  });

  test('system health view screenshot baseline', async ({ page }) => {
    await page.goto('/');
    await navigateTo(page, 'System Health');
    await page.waitForTimeout(2000);
    await expect(page).toHaveScreenshot('system-health.png', {
      maxDiffPixelRatio: 0.03, // Health view may have live timestamps
      fullPage: false,
    });
  });

  test('settings page screenshot baseline', async ({ page }) => {
    await page.goto('/');
    await navigateTo(page, 'Setting');
    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot('settings.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: false,
    });
  });
});
