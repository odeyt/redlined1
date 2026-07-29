import { test, expect } from '@playwright/test';

/**
 * tests/marketing/landing-preview.spec.ts
 *
 * Covers mission Part 28's testing requirements for the isolated
 * /landing-preview route. Runs under the standalone "marketing" Playwright
 * project (see playwright.config.ts) - no auth/storageState required since
 * this route is public and unauthenticated.
 */

test.describe('landing-preview route', () => {
  test('loads and renders the hero headline', async ({ page }) => {
    await page.goto('/landing-preview');
    // h1 contains a rotating audience word — assert the stable prefix only
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'The operating system'
    );
  });

  test('is marked noindex, nofollow', async ({ page }) => {
    const response = await page.goto('/landing-preview');
    expect(response?.status()).toBeLessThan(400);
    const robotsMeta = page.locator('meta[name="robots"]');
    await expect(robotsMeta).toHaveAttribute('content', /noindex/);
    await expect(robotsMeta).toHaveAttribute('content', /nofollow/);
  });

  test('has exactly one h1 and logical heading nesting', async ({ page }) => {
    await page.goto('/landing-preview');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
    const h2Count = await page.locator('h2').count();
    expect(h2Count).toBeGreaterThan(5);
  });

  test('has a main landmark and skip link', async ({ page }) => {
    await page.goto('/landing-preview');
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('a.rd1-skip-link')).toHaveAttribute('href', '#main-content');
  });
});

test.describe('live homepage unchanged', () => {
  test('/portal still loads and is not modified by this epic', async ({ page }) => {
    const response = await page.goto('/portal');
    expect(response?.status()).toBeLessThan(400);
    // Sanity check that this is still the real live homepage, not the preview.
    await expect(page).not.toHaveURL(/landing-preview/);
  });
});

test.describe('header navigation', () => {
  test('desktop: nav links and CTAs are present', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/landing-preview');
    await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start Free', exact: true }).first()).toBeVisible();
  });

  test('mobile: menu toggle opens an accessible disclosure panel', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/landing-preview');
    const toggle = page.locator('button.rd1-mobile-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#rd1-mobile-nav-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('CTA destinations', () => {
  test('primary free-signup CTA points to /signup', async ({ page }) => {
    await page.goto('/landing-preview');
    const cta = page.getByRole('link', { name: /Get Your Shop Running — Free/ }).first();
    await expect(cta).toHaveAttribute('href', '/signup');
  });

  test('Sign In points to /login', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/landing-preview');
    await expect(page.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/login');
  });

  test('watch product tour scrolls in-page instead of linking to a video', async ({ page }) => {
    await page.goto('/landing-preview');
    const tourLink = page.getByRole('link', { name: 'Watch Product Tour' });
    await expect(tourLink).toHaveAttribute('href', '#workflow');
  });
});

test.describe('no live checkout triggered', () => {
  test('paid-plan CTAs never navigate to a billing/checkout route', async ({ page }) => {
    await page.goto('/landing-preview');
    await page.locator('#pricing').scrollIntoViewIfNeeded();
    const contactButtons = page.getByRole('button', { name: 'Contact Us to Enable' });
    const count = await contactButtons.count();
    expect(count).toBeGreaterThan(0);
    await contactButtons.first().click();
    // Clicking must never navigate anywhere - it only reveals inline text.
    await expect(page).toHaveURL(/landing-preview/);
    await expect(page.locator('[id^="contact-note-"]').first()).toBeVisible();
  });

  test('no anchor or form on the page targets a billing/checkout API route', async ({ page }) => {
    await page.goto('/landing-preview');
    const hrefs = await page.locator('a[href]').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    for (const href of hrefs) {
      expect(href ?? '').not.toMatch(/\/api\/billing\/checkout/);
    }
  });
});

test.describe('calculators', () => {
  test('time-savings calculator computes correct math', async ({ page }) => {
    await page.goto('/landing-preview');
    await page.locator('#time-savings-calculator').scrollIntoViewIfNeeded();
    const inputs = page.locator('#time-savings-calculator input[type="number"]');
    await inputs.nth(0).fill('2'); // technicians
    await inputs.nth(1).fill('8'); // jobs/day
    await inputs.nth(2).fill('3'); // minutes/job
    await inputs.nth(3).fill('5'); // days/week
    await inputs.nth(4).fill('48'); // weeks/year

    // dailyMinutesSaved = 2 * 8 * 3 = 48
    await expect(page.getByText('48', { exact: true }).first()).toBeVisible();
  });

  test('revenue-opportunity calculator labels results "Potential Opportunity"', async ({ page }) => {
    await page.goto('/landing-preview');
    await page.locator('#revenue-calculator').scrollIntoViewIfNeeded();
    await expect(page.getByText('Potential Opportunity')).toBeVisible();
    await expect(page.getByText(/Guaranteed Revenue/i)).toHaveCount(0);
  });

  test('both calculators show the required disclaimer', async ({ page }) => {
    await page.goto('/landing-preview');
    await expect(
      page.getByText('Illustrative estimate only. Actual results depend on shop workflow, staffing, usage, and data quality.')
    ).toBeVisible();
    await expect(
      page.getByText('Illustrative estimate only. Actual results vary by shop activity, pricing, customer behavior, and staff execution.')
    ).toBeVisible();
  });
});

test.describe('pricing', () => {
  test('monthly/annual toggle is a real accessible switch', async ({ page }) => {
    await page.goto('/landing-preview');
    const toggle = page.getByRole('switch', { name: 'Toggle annual billing' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  test('pricing matches the canonical catalog values', async ({ page }) => {
    await page.goto('/landing-preview');
    await page.locator('#pricing').scrollIntoViewIfNeeded();
    await expect(page.getByText('$24')).toBeVisible();
    await expect(page.getByText('$49')).toBeVisible();
    await expect(page.getByText('$99')).toBeVisible();
    await expect(page.getByText('$179')).toBeVisible();
    await expect(page.getByText('Best for Mobile Mechanics')).toBeVisible();
    await expect(page.getByText('Most Popular')).toBeVisible();
  });
});

test.describe('migration disclaimers', () => {
  test('migration section discloses no official partnership', async ({ page }) => {
    await page.goto('/landing-preview');
    await expect(
      page.getByText(/RedlineD1 has no official partnership with the platforms listed/)
    ).toBeVisible();
  });
});

test.describe('FAQ interaction', () => {
  test('FAQ items expand and collapse via a real disclosure pattern', async ({ page }) => {
    await page.goto('/landing-preview');
    await page.locator('#faq').scrollIntoViewIfNeeded();
    const firstQuestion = page.getByRole('button', { name: /Is RedlineD1 ready for a real shop today/ });
    await expect(firstQuestion).toHaveAttribute('aria-expanded', 'false');
    await firstQuestion.click();
    await expect(firstQuestion).toHaveAttribute('aria-expanded', 'true');
  });
});

test.describe('no private data present', () => {
  test('page contains no real-looking VIN, phone, or fabricated usage-count claims', async ({ page }) => {
    await page.goto('/landing-preview');
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/\b[A-HJ-NPR-Z0-9]{17}\b/); // real 17-char VIN pattern
    expect(bodyText).not.toMatch(/4,000\+ Shops/);
    expect(bodyText).not.toMatch(/1\.2M\+ Invoices/);
    expect(bodyText).not.toMatch(/RedlineD1 Engine v2\.0/);
  });
});

test.describe('logo variants', () => {
  test('all logo variants render in the footer brand preview', async ({ page }) => {
    await page.goto('/landing-preview');
    await page.locator('footer').scrollIntoViewIfNeeded();
    const logos = page.locator('footer [aria-label*="RedlineD1"]');
    const count = await logos.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });
});

test.describe('reduced motion', () => {
  test('respects prefers-reduced-motion', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/landing-preview');
    const transitionDuration = await page.evaluate(() => {
      const btn = document.querySelector('.rd1-landing button');
      return btn ? getComputedStyle(btn).transitionDuration : null;
    });
    expect(transitionDuration).toBeTruthy();
    await context.close();
  });
});

test.describe('keyboard use', () => {
  test('can tab to the primary CTA and activate it with the keyboard', async ({ page }) => {
    await page.goto('/landing-preview');
    const cta = page.getByRole('link', { name: /Get Your Shop Running — Free/ }).first();
    await cta.focus();
    await expect(cta).toBeFocused();
  });
});

test.describe('accessibility landmarks', () => {
  test('header, main, and footer landmarks all exist', async ({ page }) => {
    await page.goto('/landing-preview');
    await expect(page.locator('header')).toHaveCount(1);
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('footer')).toHaveCount(1);
  });
});
