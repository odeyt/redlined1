import { test, expect } from '@playwright/test';

/**
 * Basic responsive smoke tests — @smoke @mobile
 * Verifies public pages don't have horizontal overflow at key breakpoints.
 * These run without auth so they work in preview and production smoke passes.
 */

// The widths named in the M-PWA brief: three phones, both tablet orientations
// and two laptop sizes. 375 is the narrowest screen still in real use and is
// where horizontal overflow shows up first.
const VIEWPORTS = [
  { label: 'iphone-se',    width: 375,  height: 812  },
  { label: 'iphone-14',    width: 390,  height: 844  },
  { label: 'pixel-7',      width: 412,  height: 915  },
  { label: 'tablet-port',  width: 768,  height: 1024 },
  { label: 'tablet-land',  width: 1024, height: 768  },
  { label: 'laptop',       width: 1280, height: 800  },
  { label: 'laptop-large', width: 1440, height: 900  },
];

for (const vp of VIEWPORTS) {
  test.describe(`Responsive — ${vp.label} (${vp.width}px) @smoke`, () => {

    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('login page fits viewport without horizontal scroll', async ({ page }) => {
      await page.goto('/login');
      await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 });

      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(vp.width + 4); // ±4px tolerance
    });

    test('signup page fits viewport without horizontal scroll', async ({ page }) => {
      await page.goto('/signup');
      await expect(page.locator('button[type="submit"]')).toBeVisible({ timeout: 15_000 });

      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(vp.width + 4);
    });

    test('login form is usable (inputs and submit visible)', async ({ page }) => {
      await page.goto('/login');
      await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();

      // Ensure submit button is not clipped off-screen
      const btn = page.locator('button[type="submit"]');
      const box = await btn.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 4);
      }
    });

  });
}
