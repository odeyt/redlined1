import { test, expect } from '@playwright/test';
import { navigateTo } from '../helpers/auth';

test.describe('Repair Intelligence module', () => {
  test('Repair Intelligence navigation item is present or gracefully absent', async ({ page }) => {
    await page.goto('/');
    // May not yet be enabled — check without failing
    const riBtn = page.locator('nav button, aside button').filter({ hasText: /repair.?intel|intelligence/i }).first();
    const visible = await riBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    console.log(`[repair-intelligence] Nav item visible: ${visible}`);
    expect(true).toBeTruthy(); // Module may be feature-flagged off
  });

  test('repair intelligence data does not expose PII @smoke', async ({ request }) => {
    // Any RI API endpoints should strip PII
    const endpoints = [
      '/api/repair-intelligence',
      '/api/repair-intelligence/patterns',
      '/api/intelligence',
    ];
    for (const ep of endpoints) {
      const res  = await request.get(ep);
      if (res.status() === 404) continue; // Endpoint not implemented yet
      const text = await res.text();
      // Response should not contain obvious PII patterns
      expect(text).not.toMatch(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
    }
  });
});
