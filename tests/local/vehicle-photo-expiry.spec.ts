/**
 * The regression for "the vehicle photos erase themselves".
 *
 * What actually happened in production: every signed URL on the Vehicles page
 * was minted when the page loaded and lasted an hour, and `loading="lazy"`
 * means a thumbnail below the fold is not FETCHED until it is scrolled to. On
 * a tab a shop leaves open all day, that fetch happens long after the URL
 * died. Photos already in the browser cache kept rendering, so the owner saw
 * some thumbnails and some blanks and concluded the images were being deleted.
 *
 * Reproducing that honestly would mean waiting an hour, so expiry is faked
 * rather than waited for: the signing endpoint is stubbed to mint URLs
 * carrying a generation marker, and the image endpoint refuses every marker
 * but the current one. Bumping the generation is exactly what an expiry is,
 * from the browser's point of view — the URL it holds stops working and a
 * newly signed one works.
 *
 * No storage object is uploaded and none is read: both storage routes are
 * intercepted, so this test cannot touch a real file. It creates its own
 * throwaway shop and deletes it afterwards.
 *
 *   npm run test:local -- tests/local/vehicle-photo-expiry.spec.ts
 */
import { test, expect, Page, Route } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { createSyntheticShop, destroySyntheticShop, SyntheticShop } from '../helpers/synthetic-shop';

/** Enough rows that the last thumbnails are well below the fold. */
const VEHICLE_COUNT = 40;

/** A 1x1 transparent PNG — what a "working" image request returns. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

let shop: SyntheticShop;
let admin: SupabaseClient;
let vehicleIds: string[] = [];

/**
 * The generation a freshly signed URL is stamped with, and the only one the
 * image endpoint will serve. Raising it expires every URL the page is holding.
 */
let generation = 1;
/** Every batch signing request the page made, so volume can be asserted. */
let signingRequests: number[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  shop = await createSyntheticShop('photo-expiry');
  admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const vehicles = Array.from({ length: VEHICLE_COUNT }, (_, i) => ({
    id: randomUUID(),
    shop_id: shop.shopId,
    label: `Expiry Probe ${String(i + 1).padStart(2, '0')}`,
    vin: `PHOTOEXPIRY${String(i).padStart(6, '0')}`,
    status: 'Active',
  }));
  vehicleIds = vehicles.map(v => v.id);

  const { error: vErr } = await admin.from('vehicles').insert(vehicles);
  if (vErr) throw new Error(`could not seed vehicles: ${vErr.message}`);

  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/shop-assets/`;
  const images = vehicles.map(v => ({
    vehicle_id: v.id,
    // Both columns, exactly as a post-migration row looks. No object is ever
    // uploaded for these keys — the image route is stubbed.
    storage_path: `vehicles/${v.id}/probe.jpg`,
    url: `${base}vehicles/${v.id}/probe.jpg`,
    label: 'Probe',
  }));
  const { error: iErr } = await admin.from('vehicle_images').insert(images);
  if (iErr) throw new Error(`could not seed vehicle_images: ${iErr.message}`);
});

test.afterAll(async () => {
  if (admin && vehicleIds.length) {
    await admin.from('vehicle_images').delete().in('vehicle_id', vehicleIds);
    await admin.from('vehicles').delete().in('id', vehicleIds);
  }
  if (shop) await destroySyntheticShop(shop);
});

/**
 * Stubs both halves of the storage contract.
 *
 * POST /storage/v1/object/sign/shop-assets   → mints URLs stamped `gen<N>`
 * GET  /storage/v1/object/sign/shop-assets/… → serves gen<current>, refuses the rest
 */
async function stubStorage(page: Page): Promise<void> {
  await page.route('**/storage/v1/object/sign/shop-assets**', async (route: Route) => {
    const request = route.request();

    if (request.method() === 'POST') {
      const body = JSON.parse(request.postData() || '{}') as { paths?: string[] };
      const paths = body.paths ?? [];
      signingRequests.push(paths.length);
      const origin = new URL(request.url()).origin;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(paths.map(p => ({
          error: null,
          path: p,
          signedURL: `${origin}/storage/v1/object/sign/shop-assets/${p}?token=gen${generation}`,
        }))),
      });
    }

    const token = new URL(request.url()).searchParams.get('token');
    if (token === `gen${generation}`) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL });
    }
    // What an expired signature looks like to the browser.
    return route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: '400', error: 'InvalidJWT', message: 'jwt expired' }),
    });
  });
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[type="email"]', shop.email);
  await page.fill('input[type="password"]', shop.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 25_000 });
}

/** Marks this document so a full-page reload can be detected. */
async function markDocument(page: Page): Promise<string> {
  const id = randomUUID();
  await page.evaluate(marker => { (window as unknown as Record<string, string>).__photoTestMarker = marker; }, id);
  return id;
}

async function stillTheSameDocument(page: Page, marker: string): Promise<boolean> {
  return page.evaluate(
    m => (window as unknown as Record<string, string>).__photoTestMarker === m,
    marker,
  );
}

/** Every thumbnail the page has actually painted. */
async function loadedThumbnails(page: Page): Promise<number> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('img'))
      .filter(i => i.currentSrc.includes('/shop-assets/') && i.naturalWidth > 0)
      .length);
}

async function openVehicles(page: Page): Promise<void> {
  await page.goto('/');
  const link = page.locator('a, button').filter({ hasText: /vehicle/i }).first();
  await link.click();
  await expect(page.locator('img').first()).toBeVisible({ timeout: 20_000 });
}

test.beforeEach(async ({ page }) => {
  generation = 1;
  signingRequests = [];
  await stubStorage(page);
});

test('a thumbnail scrolled to after its URL expired recovers, without reloading the page', async ({ page }) => {
  await signIn(page);
  await openVehicles(page);
  const marker = await markDocument(page);

  const visibleAtFirst = await loadedThumbnails(page);
  expect(visibleAtFirst, 'the page should paint thumbnails before anything expires').toBeGreaterThan(0);

  // An hour passes with the tab open. Every URL the page is holding dies.
  generation = 2;

  // The owner scrolls. These thumbnails are being FETCHED for the first time,
  // with URLs minted an hour ago — the exact production failure.
  await page.mouse.wheel(0, 20_000);
  await page.waitForTimeout(500);
  await page.mouse.wheel(0, 20_000);

  // They load anyway: the failed request triggers one re-signature.
  await expect.poll(
    () => loadedThumbnails(page),
    { timeout: 20_000, message: 'lazy thumbnails did not recover after their URLs expired' },
  ).toBeGreaterThan(visibleAtFirst);

  await expect(page.getByLabel('Photo unavailable')).toHaveCount(0);
  expect(await stillTheSameDocument(page, marker), 'the page must recover without a reload').toBe(true);
});

test('coming back to a backgrounded tab renews everything before it is fetched', async ({ page }) => {
  await signIn(page);
  await openVehicles(page);
  const marker = await markDocument(page);
  const signedBefore = signingRequests.length;

  // The tab is hidden for an hour.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  generation = 2;

  // The owner comes back to it.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });

  await expect.poll(
    () => signingRequests.length,
    { timeout: 15_000, message: 'returning to the tab did not renew the signatures' },
  ).toBeGreaterThan(signedBefore);

  await page.mouse.wheel(0, 20_000);
  await expect.poll(() => loadedThumbnails(page), { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(page.getByLabel('Photo unavailable')).toHaveCount(0);
  expect(await stillTheSameDocument(page, marker)).toBe(true);
});

test('recovery is batched, and a genuinely dead object does not loop', async ({ page }) => {
  await signIn(page);
  await openVehicles(page);

  // Nothing will ever serve an image again. Every thumbnail fails, retries
  // once, fails again, and stops.
  generation = -1;
  await page.mouse.wheel(0, 20_000);
  await expect.poll(
    () => page.getByLabel('Photo unavailable').count(),
    { timeout: 20_000, message: 'a permanently failing photo should fall back to a placeholder' },
  ).toBeGreaterThan(0);

  const afterFallback = signingRequests.length;
  await page.waitForTimeout(5_000);

  // The important assertion: it stopped. An unguarded onError would still be
  // signing here, forever, on a tab nobody is watching.
  expect(signingRequests.length - afterFallback,
    'signing continued after the placeholder appeared — the retry guard is not holding').toBeLessThanOrEqual(1);

  // And the batching held throughout: never one request per image.
  const largestBatch = Math.max(...signingRequests, 0);
  expect(largestBatch).toBeGreaterThan(1);
  expect(signingRequests.length).toBeLessThan(VEHICLE_COUNT);
});
