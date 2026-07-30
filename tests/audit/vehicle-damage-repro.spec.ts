/**
 * Regression: RO internal notes must not leak into Damage at Intake, and a
 * saved Issues value must survive reopening the vehicle form (auto-pull).
 * Seed data: vehicle "E2E Repro Truck #9999" + RO-E2E01 in the E2E Audit Shop.
 */
import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../.auth/audit-user.json') });

test('Damage at Intake stays empty; saved Issues text survives auto-pull', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.sidebar, aside').first()).toBeVisible({ timeout: 20_000 });

  // Open Vehicles module
  await page.locator('.sidebar button, aside button, .sidebar a, aside a')
    .filter({ hasText: /vehicles/i }).first().click();
  await page.waitForTimeout(1500);

  // Open the repro vehicle
  await page.getByText('E2E Repro Truck #9999').first().click();
  await page.waitForTimeout(3000); // allow auto-pull from RO to run

  // Field values
  const issuesVal = await page.locator('textarea').filter({ hasText: /MOVED TEXT/ }).first()
    .inputValue().catch(async () =>
      // Fallback: locate by preceding label
      page.locator('text=Issues / Work Needed').locator('xpath=following::textarea[1]').inputValue()
    );
  const damageVal = await page
    .locator('text=Damage at Intake').locator('xpath=following::textarea[1]').inputValue();

  console.log('issues =', JSON.stringify(issuesVal));
  console.log('damage =', JSON.stringify(damageVal));

  // Saved issues text preserved — not replaced by 'RO CONCERN TEXT'
  expect(issuesVal).toContain('MOVED TEXT');
  // RO internal notes must NOT be pulled into Damage at Intake
  expect(damageVal).not.toContain('RO INTERNAL NOTES');
  expect(damageVal).toBe('');
});
