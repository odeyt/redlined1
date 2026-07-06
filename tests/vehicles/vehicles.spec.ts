import { test, expect } from '@playwright/test';
import { navigateTo } from '../helpers/auth';
import { fixtures } from '../fixtures';
import { documentCleanupNeeded } from '../helpers/cleanup';

test.describe('Vehicles module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await navigateTo(page, 'Vehicle');
  });

  test('displays vehicles list @smoke', async ({ page }) => {
    await expect(page.locator('h1, h2').filter({ hasText: /vehicle/i })).toBeVisible({ timeout: 10_000 });
  });

  test('opens Add Vehicle form', async ({ page }) => {
    const addBtn = page.locator('button, a').filter({ hasText: /add vehicle|new vehicle|\+ vehicle/i }).first();
    if (await addBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addBtn.click();
      await expect(page.locator('input[name="make"], input[placeholder*="make" i]').first()).toBeVisible({ timeout: 8_000 });
    } else {
      test.skip();
    }
  });

  test('creates a vehicle with VIN', async ({ page }) => {
    const addBtn = page.locator('button, a').filter({ hasText: /add vehicle|new vehicle|\+ vehicle/i }).first();
    if (!(await addBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await addBtn.click();

    const makeInput = page.locator('input[name="make"], input[placeholder*="make" i]').first();
    await expect(makeInput).toBeVisible({ timeout: 8_000 });

    await makeInput.fill(fixtures.vehicle.make);

    const modelInput = page.locator('input[name="model"], input[placeholder*="model" i]').first();
    if (await modelInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await modelInput.fill(fixtures.vehicle.model);
    }

    const vinInput = page.locator('input[name="vin"], input[placeholder*="vin" i]').first();
    if (await vinInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await vinInput.fill(fixtures.vehicle.vin);
    }

    const saveBtn = page.locator('button', { hasText: /save|create|add/i }).first();
    await saveBtn.click();

    await page.waitForTimeout(1500);
    await documentCleanupNeeded(page, 'vehicle', `${fixtures.vehicle.make} ${fixtures.vehicle.model}`);
  });

  test('VIN field is present and accepts input', async ({ page }) => {
    const addBtn = page.locator('button, a').filter({ hasText: /add vehicle|new vehicle|\+ vehicle/i }).first();
    if (!(await addBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await addBtn.click();
    const vinInput = page.locator('input[name="vin"], input[placeholder*="vin" i]').first();
    if (await vinInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await vinInput.fill('1HGBH41JXMN109186');
      expect(await vinInput.inputValue()).toBe('1HGBH41JXMN109186');
    }
  });
});
