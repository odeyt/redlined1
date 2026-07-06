import { Page, expect } from '@playwright/test';

export async function login(page: Page, email?: string, password?: string): Promise<void> {
  const e = email    ?? process.env.TEST_OWNER_EMAIL    ?? '';
  const p = password ?? process.env.TEST_OWNER_PASSWORD ?? '';

  await page.goto('/login');
  await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });
  await page.fill('#email', e);
  await page.fill('#password', p);
  await page.click('.login-btn');
  await page.waitForURL('/', { timeout: 15_000 });
}

export async function logout(page: Page): Promise<void> {
  // Try sidebar logout button or keyboard shortcut
  const logoutBtn = page.locator('button', { hasText: /log.?out|sign.?out/i });
  if (await logoutBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await logoutBtn.click();
  } else {
    await page.goto('/login');
  }
}

export async function navigateTo(page: Page, module: string): Promise<void> {
  const navBtn = page.locator('nav button, aside button, [role="navigation"] button').filter({ hasText: new RegExp(module, 'i') });
  await navBtn.first().click();
  await page.waitForTimeout(500);
}
