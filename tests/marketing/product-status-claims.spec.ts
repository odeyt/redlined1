import { test, expect } from '@playwright/test';

/**
 * tests/marketing/product-status-claims.spec.ts
 *
 * Verifies /landing-preview never makes a claim that exceeds what
 * docs/design/aura/PRODUCT_STATUS_MATRIX.md classifies as real. Runs under
 * the standalone "marketing" Playwright project (see playwright.config.ts).
 */

test.describe('product-status label consistency', () => {
  test('Sapelee is never mentioned anywhere on the page', async ({ page }) => {
    await page.goto('/landing-preview');
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/Sapelee/i);
  });

  test('native mobile apps are not claimed as live', async ({ page }) => {
    await page.goto('/landing-preview');
    await expect(page.getByText('Mobile-ready today')).toBeVisible();
    const bodyText = await page.locator('body').innerText();
    // "native app" may appear only under the Planned column, never as "available now"
    expect(bodyText).not.toMatch(/download (our|the) (native )?app/i);
    expect(bodyText).not.toMatch(/available on the App Store/i);
    expect(bodyText).not.toMatch(/available on Google Play/i);
  });

  test('Product Evolution section separates Available Now / Rolling Out / Planned', async ({ page }) => {
    await page.goto('/landing-preview');
    await expect(page.getByText('Available Now', { exact: true })).toBeVisible();
    await expect(page.getByText('Rolling Out', { exact: true })).toBeVisible();
    await expect(page.getByText('Planned', { exact: true })).toBeVisible();
    await expect(page.getByText('Native mobile apps')).toBeVisible();
  });

  test('no fabricated version marker ("Engine v2.0") appears', async ({ page }) => {
    await page.goto('/landing-preview');
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/Engine v2\.0/i);
  });

  test('comparison section never names a specific competitor', async ({ page }) => {
    await page.goto('/landing-preview');
    await page.locator('#comparison').scrollIntoViewIfNeeded();
    await expect(page.getByRole('columnheader', { name: 'Traditional Shop Software' })).toBeVisible();
    const bodyText = await page.locator('#comparison').innerText();
    for (const competitor of ['Tekmetric', 'Shopmonkey', 'Mitchell 1', 'AutoLeap']) {
      expect(bodyText).not.toContain(competitor);
    }
  });
});
