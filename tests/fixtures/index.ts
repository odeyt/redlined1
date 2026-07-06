import { test as base, expect } from '@playwright/test';
import { TEST_CUSTOMER_NAME, TEST_VEHICLE_MODEL, TEST_JOB_COMPLAINT } from '../helpers/cleanup';

export { TEST_CUSTOMER_NAME, TEST_VEHICLE_MODEL, TEST_JOB_COMPLAINT };

export type TestFixtures = {
  ownerPage: import('@playwright/test').Page;
  technicianPage: import('@playwright/test').Page;
};

/** Extended test with pre-authenticated owner page. */
export const test = base.extend<TestFixtures>({
  ownerPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: 'tests/.auth/owner.json',
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  // Technician fixture — uses separate credentials if provided
  technicianPage: async ({ browser }, use) => {
    const techEmail    = process.env.TEST_TECH_EMAIL;
    const techPassword = process.env.TEST_TECH_PASSWORD;

    const context = await browser.newContext();
    const page = await context.newPage();

    if (techEmail && techPassword) {
      await page.goto('/login');
      await page.fill('#email', techEmail);
      await page.fill('#password', techPassword);
      await page.click('.login-btn');
      await page.waitForURL('/');
    }

    await use(page);
    await context.close();
  },
});

export { expect };

/** Reusable demo data constants. */
export const fixtures = {
  customer: {
    name:    TEST_CUSTOMER_NAME,
    phone:   '555-0100',
    email:   'test-auto@redlined1-test.local',
    address: '123 Test Lane, Test City TX 75000',
  },
  vehicle: {
    year:  '2020',
    make:  'Toyota',
    model: TEST_VEHICLE_MODEL,
    vin:   '1HGBH41JXMN109186',
    color: 'Silver',
  },
  jobCard: {
    complaint: TEST_JOB_COMPLAINT,
    notes:     '[TEST] Created by Playwright regression suite',
  },
  estimate: {
    laborDescription: '[TEST] Brake inspection',
    laborRate:        '145',
    laborHours:       '1.5',
  },
};
