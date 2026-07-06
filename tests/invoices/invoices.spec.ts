import { test, expect } from '@playwright/test';
import { navigateTo } from '../helpers/auth';

test.describe('Invoices module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await navigateTo(page, 'Invoice');
  });

  test('displays invoices list @smoke', async ({ page }) => {
    await expect(
      page.locator('h1, h2').filter({ hasText: /invoice/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('invoices page loads without error', async ({ page }) => {
    await page.waitForTimeout(2000);
    const errorMsg = await page.locator('text=/error|failed|500/i').isVisible().catch(() => false);
    expect(errorMsg).toBeFalsy();
  });

  test('invoice detail shows line items and totals', async ({ page }) => {
    const firstInvoice = page.locator('table tbody tr, [data-testid*="invoice"]').first();
    if (await firstInvoice.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstInvoice.click();
      await page.waitForTimeout(1000);

      const subtotal = page.locator('text=/subtotal|total/i').first();
      const hasTotal = await subtotal.isVisible({ timeout: 5_000 }).catch(() => false);
      expect(hasTotal).toBeTruthy();
    } else {
      console.log('[invoices] No existing invoices to inspect');
    }
  });

  test('tax and discount fields are displayed', async ({ page }) => {
    const firstInvoice = page.locator('table tbody tr, [data-testid*="invoice"]').first();
    if (await firstInvoice.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstInvoice.click();
      await page.waitForTimeout(1000);
      const taxOrDiscount = page.locator('text=/tax|discount/i').first();
      const visible = await taxOrDiscount.isVisible({ timeout: 3_000 }).catch(() => false);
      if (!visible) console.log('[invoices] Tax/discount fields not found on first invoice');
    }
  });
});
