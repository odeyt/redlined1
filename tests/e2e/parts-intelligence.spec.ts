import { test, expect, type Page } from '@playwright/test';

/**
 * Parts Intelligence, end to end.
 *
 * NOT RUN in the environment these were written in — they need an
 * authenticated session, and no test credentials were available. They are
 * committed so the flow is covered the moment a login fixture exists, and the
 * report says plainly that they are unexecuted rather than implying a pass.
 *
 * The provider is mocked at the network boundary in every test. CI must never
 * depend on eBay being up, and a test that spends real API quota is a test
 * nobody runs. A live smoke test is opt-in via EBAY_TEST_LIVE=true.
 */

const SEARCH_ROUTE = '**/api/parts/search';

const AKEBONO = {
  provider: 'ebay',
  providerListingId: 'v1|123|0',
  title: 'Akebono ProACT ACT976 Front Brake Pads',
  brand: 'Akebono',
  manufacturerPartNumber: 'ACT976',
  imageUrl: 'https://i.ebayimg.com/images/g/test/s-l500.jpg',
  productUrl: 'https://www.ebay.com/itm/123',
  currency: 'USD',
  itemPrice: 64.95,
  shippingCost: 8,
  estimatedTax: null,
  estimatedImportDuty: null,
  landedCost: 72.95,
  landedCostCompleteness: 'partial',
  condition: 'New',
  sellerName: 'partsdepot',
  sellerRating: 0.986,
  estimatedDeliveryStart: '2026-09-02T00:00:00.000Z',
  estimatedDeliveryEnd: '2026-09-05T00:00:00.000Z',
  fitmentStatus: 'verified',
  fitmentReason: 'eBay confirms compatibility with 2019 Toyota Tacoma.',
  sourceCheckedAt: new Date().toISOString(),
  recommendation: {
    score: 94,
    label: 'best_overall',
    reasons: ['Verified fitment for this vehicle', 'Akebono is a recognised manufacturer'],
  },
};

function mockSearch(page: Page, results: unknown[], role = 'owner') {
  return page.route(SEARCH_ROUTE, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      results,
      providers: [
        { id: 'ebay', name: 'eBay', enabled: true, status: 'ready' },
        { id: 'amazon', name: 'Amazon', enabled: false, status: 'missing_credentials',
          reason: 'Amazon Creators API credentials/eligibility not configured' },
      ],
      outcomes: [{ provider: 'ebay', ok: true, count: results.length }],
      searchedAt: new Date().toISOString(),
      role,
    }),
  }));
}

/** Replace with the repo's real login fixture when one exists. */
async function openEstimateForm(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /estimates/i }).first().click();
  await page.getByRole('button', { name: /new estimate/i }).first().click();
}

test.describe('Parts Intelligence in estimates', () => {
  // Test A — the fallback that must never break.
  test('manual part entry still works with no provider involved', async ({ page }) => {
    await openEstimateForm(page);

    await page.getByPlaceholder('Part / service description').first().fill('Brake pads');
    await expect(page.getByPlaceholder('Part / service description').first())
      .toHaveValue('Brake pads');

    // Search Parts is an addition, not a replacement.
    await expect(page.getByRole('button', { name: /add line/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /search parts/i })).toBeVisible();
  });

  // Test B — the search flow.
  test('search, compare, select and add', async ({ page }) => {
    await mockSearch(page, [AKEBONO]);
    await openEstimateForm(page);

    await page.getByRole('button', { name: /search parts/i }).click();
    await page.getByLabel('Part search').fill('front brake pads');
    await page.getByRole('button', { name: /^search$/i }).click();

    const card = page.getByText(AKEBONO.title);
    await expect(card).toBeVisible();
    await expect(page.getByText('VERIFIED FIT')).toBeVisible();
    await expect(page.getByText(/Landed USD 72\.95/)).toBeVisible();
    await expect(page.locator(`img[src="${AKEBONO.imageUrl}"]`)).toBeVisible();
    // A verified result carries no warning; everything else must.
    await expect(page.getByText('Verify fitment before ordering.')).toHaveCount(0);

    await page.getByRole('button', { name: /select this part/i }).click();

    // No default markup: the button stays disabled until one is entered.
    const add = page.getByRole('button', { name: /add to estimate/i });
    await expect(add).toBeDisabled();

    await page.getByLabel('%').fill('35');
    await expect(page.getByText(/Sell USD 98\.48/)).toBeVisible();
    await add.click();

    // 72.95 x 1.35 = 98.48 lands on the estimate line.
    await expect(page.locator('input[value="98.48"]').first()).toBeVisible();
  });

  test('an unverified result carries the warning', async ({ page }) => {
    await mockSearch(page, [{
      ...AKEBONO, fitmentStatus: 'unverified',
      fitmentReason: 'The seller has not listed compatibility.',
      recommendation: { score: 60, label: null, reasons: [] },
    }]);
    await openEstimateForm(page);
    await page.getByRole('button', { name: /search parts/i }).click();
    await page.getByLabel('Part search').fill('front brake pads');
    await page.getByRole('button', { name: /^search$/i }).click();

    await expect(page.getByText('Verify fitment before ordering.')).toBeVisible();
  });

  test('an incompatible result cannot be selected', async ({ page }) => {
    await mockSearch(page, [{
      ...AKEBONO, fitmentStatus: 'incompatible',
      recommendation: { score: 0, label: null, reasons: ['Does not fit'] },
    }]);
    await openEstimateForm(page);
    await page.getByRole('button', { name: /search parts/i }).click();
    await page.getByLabel('Part search').fill('front brake pads');
    await page.getByRole('button', { name: /^search$/i }).click();

    await expect(page.getByRole('button', { name: /does not fit this vehicle/i })).toBeDisabled();
  });

  // Test C — the guarantee.
  test('the saved estimate price does not move when the market does', async ({ page }) => {
    await mockSearch(page, [AKEBONO]);
    await openEstimateForm(page);

    await page.getByRole('button', { name: /search parts/i }).click();
    await page.getByLabel('Part search').fill('front brake pads');
    await page.getByRole('button', { name: /^search$/i }).click();
    await page.getByRole('button', { name: /select this part/i }).click();
    await page.getByLabel('%').fill('35');
    await page.getByRole('button', { name: /add to estimate/i }).click();
    await page.getByRole('button', { name: /create estimate|save changes/i }).click();

    // The market moves.
    await page.unroute(SEARCH_ROUTE);
    await mockSearch(page, [{ ...AKEBONO, itemPrice: 120, landedCost: 128 }]);

    await page.reload();
    // Still the price that was quoted.
    await expect(page.getByText('98.48').first()).toBeVisible();
    await expect(page.getByText('128')).toHaveCount(0);
  });

  test('a provider outage never blocks the estimate', async ({ page }) => {
    await page.route(SEARCH_ROUTE, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [],
        providers: [{ id: 'ebay', name: 'eBay', enabled: true, status: 'ready' }],
        outcomes: [{ provider: 'ebay', ok: false, count: 0, message: 'Timed out.' }],
        searchedAt: new Date().toISOString(),
        role: 'owner',
      }),
    }));
    await openEstimateForm(page);
    await page.getByRole('button', { name: /search parts/i }).click();
    await page.getByLabel('Part search').fill('front brake pads');
    await page.getByRole('button', { name: /^search$/i }).click();

    await expect(page.getByText(/still add the part manually/i)).toBeVisible();
  });

  test('a technician does not see wholesale cost', async ({ page }) => {
    await mockSearch(page, [AKEBONO], 'technician');
    await openEstimateForm(page);
    await page.getByRole('button', { name: /search parts/i }).click();
    await page.getByLabel('Part search').fill('front brake pads');
    await page.getByRole('button', { name: /^search$/i }).click();

    await expect(page.getByText(/Source pricing hidden for your role/i)).toBeVisible();
    await expect(page.getByText(/Landed USD 72\.95/)).toHaveCount(0);
  });

  // Test D — mobile.
  for (const [label, size] of [
    ['phone', { width: 390, height: 844 }],
    ['tablet', { width: 768, height: 1024 }],
  ] as const) {
    test(`usable on ${label} with no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize(size);
      await mockSearch(page, [AKEBONO]);
      await openEstimateForm(page);

      await page.getByRole('button', { name: /search parts/i }).click();
      await page.getByLabel('Part search').fill('front brake pads');
      await page.getByRole('button', { name: /^search$/i }).click();
      await expect(page.getByText(AKEBONO.title)).toBeVisible();

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow).toBe(false);

      await page.getByRole('button', { name: /select this part/i }).click();
      // The sticky bar keeps Add reachable without scrolling the modal away.
      await expect(page.getByRole('button', { name: /add to estimate/i })).toBeInViewport();
    });
  }
});

/**
 * Opt-in only. One query, no assertions about specific listings — eBay's
 * inventory changes hourly and a test that asserts a price is a test that
 * fails for the wrong reason.
 */
test.describe('live provider smoke', () => {
  test.skip(process.env.EBAY_TEST_LIVE !== 'true', 'set EBAY_TEST_LIVE=true with credentials');

  test('eBay returns something for a common part', async ({ request }) => {
    const res = await request.post('/api/parts/search', {
      data: {
        query: 'front brake pads',
        shopId: process.env.E2E_SHOP_ID,
        year: 2019, make: 'Toyota', model: 'Tacoma',
      },
    });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(Array.isArray(json.results)).toBe(true);
    // Never assert `verified` — that depends on the listing, not on our code.
    for (const r of json.results) {
      expect(['verified', 'likely', 'unverified', 'incompatible']).toContain(r.fitmentStatus);
    }
  });
});
