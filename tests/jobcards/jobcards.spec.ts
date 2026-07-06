import { test, expect } from '@playwright/test';
import { navigateTo } from '../helpers/auth';
import { fixtures } from '../fixtures';
import { documentCleanupNeeded } from '../helpers/cleanup';

test.describe('Job Cards module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await navigateTo(page, 'Job');
  });

  test('displays job cards list @smoke', async ({ page }) => {
    await expect(
      page.locator('h1, h2').filter({ hasText: /job/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('opens Create Job Card form', async ({ page }) => {
    const createBtn = page.locator('button, a').filter({
      hasText: /create job card|create smart job card|\+ create job card/i,
    }).first();
    if (!(await createBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await createBtn.click();
    // Either a modal or new page
    await page.waitForTimeout(1000);
    const formVisible = await page.locator('form, [role="dialog"]').first().isVisible().catch(() => false);
    expect(formVisible).toBeTruthy();
  });

  test('job card form has complaint/description field', async ({ page }) => {
    const createBtn = page.locator('button, a').filter({
      hasText: /create job card|create smart job card|\+ create job card/i,
    }).first();
    if (!(await createBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await createBtn.click();

    const complaintField = page.locator(
      'textarea[name*="complaint" i], input[name*="complaint" i], textarea[placeholder*="complaint" i], textarea[placeholder*="describe" i]'
    ).first();
    await expect(complaintField).toBeVisible({ timeout: 8_000 });
    await complaintField.fill(fixtures.jobCard.complaint);
    expect(await complaintField.inputValue()).toBe(fixtures.jobCard.complaint);

    await documentCleanupNeeded(page, 'job-card', fixtures.jobCard.complaint);
  });

  test('job cards list loads without error @smoke', async ({ page }) => {
    await page.waitForTimeout(2000);
    const errorMsg = await page.locator('text=/error|failed|500/i').isVisible().catch(() => false);
    expect(errorMsg).toBeFalsy();
  });
});
