/**
 * "How to Know What Every Car in Your Repair Shop Is Waiting For"
 *
 * Records the first RedlineD1 walkthrough against PRODUCTION, inside the one
 * demo tenant, and only after every safety gate passes.
 *
 *   npm run capture:marketing
 *
 * ## The order of events
 *
 *   1. Gates are evaluated from read-only production queries. Any failure stops
 *      the run before a browser page exists, so nothing is recorded.
 *   2. The saved session is checked in a SEPARATE, unrecorded context. An expired
 *      session would otherwise put the login page on camera.
 *   3. The walkthrough runs in the recorded page. Every click goes through
 *      press(), which refuses the controls in FORBIDDEN_CONTROL_NAMES.
 *   4. The page closes (which finalises the video), the file is saved to
 *      marketing-output/, and the finish gates re-read production.
 *
 * ## What the walkthrough changes, all inside the demo shop
 *
 *   job card    technician Alex Morgan assigned; Booked -> Approved
 *   repair order Open -> In Progress -> Pending Parts -> In Progress ->
 *                Pending Approval -> QA sign-off -> Complete
 *
 * It creates no record, so no Sapelee event is queued. It never presses Close
 * (closeJob drafts an invoice from the shared sequence and emits
 * repair.completed). QA sign-off drafts nothing, because the seeded repair order
 * already carries its demo invoice.
 *
 * Statuses are the application's real ones. The job card cannot reach
 * "In Progress" or "Complete" through the UI, and the repair-stage tracker is
 * not demonstrated: its columns do not exist in production.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { copyFileSync, mkdirSync } from 'fs';
import {
  APPROVED_BASE_URL, DEMO, evaluateFinishGates, evaluateStartGates, isForbiddenControl, type GateFacts,
} from '@/lib/marketing-capture/gates';
import { collectGateFacts, DEMO_AUTH_STATE } from './gate-facts';

const PAUSE_AFTER_NAVIGATION = 1_800;
const PAUSE_AFTER_CHANGE = 1_800;
const PAUSE_ON_FINAL_VIEW = 3_500;
const OUTPUT_WEBM = 'marketing-output/redlined1-first-workflow.webm';

test.describe.configure({ mode: 'serial', retries: 0 });

let before: GateFacts;
/** Set only once every start gate has passed; the finish gates judge nothing otherwise. */
let started = false;

test.beforeAll(async ({ browser }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  before = await collectGateFacts(baseURL);
  const start = evaluateStartGates(before);
  if (!start.ok) {
    throw new Error(`[marketing-capture] refusing to record:\n  - ${start.failures.join('\n  - ')}`);
  }

  // Unrecorded check: the session must reach the app shell, not /login.
  const probe = await browser.newContext({ baseURL, storageState: DEMO_AUTH_STATE });
  try {
    const page = await probe.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    if (new URL(page.url()).pathname.startsWith('/login')) {
      throw new Error('[marketing-capture] saved session has expired; run capture:marketing:prepare again');
    }
    await expect(page.getByText(DEMO.shopName, { exact: true }).first()).toBeVisible();
  } finally {
    await probe.close();
  }
  started = true;
});

/** Clicks, unless the control is one the capture must never press. */
async function press(target: Locator) {
  const name = (await target.getAttribute('aria-label')) ?? (await target.innerText());
  if (isForbiddenControl(name)) throw new Error(`[marketing-capture] refusing to press "${name}"`);
  await target.click();
}

/** Opens a sidebar module by its label from lib/mock-data.ts navItems. Exactly one match or fail. */
async function openModule(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const item = page
    .locator('nav button, aside button, [role="navigation"] button')
    .filter({ hasText: new RegExp(`\\b${escaped}\\b`) });
  await expect(item).toHaveCount(1);
  await press(item);
  await page.waitForTimeout(PAUSE_AFTER_NAVIGATION);
}

test('first workflow: from customer to Command Center', async ({ page }) => {
  await test.step('open the demo tenant and confirm which shop this is', async () => {
    await page.goto('/');
    expect(new URL(page.url()).origin).toBe(APPROVED_BASE_URL);
    await expect(page.getByText(DEMO.shopName, { exact: true }).first()).toBeVisible();
    // A real shop's name on screen means the wrong tenant is loaded.
    await expect(page.getByText(/D1 Imports/)).toHaveCount(0);
    await page.waitForTimeout(PAUSE_AFTER_NAVIGATION);
  });

  await test.step('customer', async () => {
    await openModule(page, 'Customers');
    await page.getByPlaceholder('Search customers…').fill(DEMO.customer);
    const customer = page.getByText(DEMO.customer, { exact: true }).first();
    await expect(customer).toBeVisible();
    await press(customer);
    await page.waitForTimeout(PAUSE_AFTER_NAVIGATION);
  });

  await test.step('vehicle', async () => {
    await openModule(page, 'Vehicles');
    await page.getByPlaceholder('Search customer, vehicle, VIN, plate, tech…').fill(DEMO.plate);
    await expect(page.getByText(DEMO.plate, { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(PAUSE_AFTER_NAVIGATION);
  });

  // The one job card for this customer and vehicle; anything else stops the run.
  const jobRow = page.getByRole('row').filter({ hasText: DEMO.customer }).filter({ hasText: DEMO.vehicleLabel });

  await test.step('job card: assign technician', async () => {
    await openModule(page, 'Job Cards');
    await expect(jobRow).toHaveCount(1);
    await page.waitForTimeout(PAUSE_AFTER_NAVIGATION);

    await press(jobRow.getByRole('button', { name: 'Edit', exact: true }));
    const technician = page.getByLabel(DEMO.technician, { exact: true });
    await expect(technician).toHaveCount(1);
    await technician.check();
    await press(page.getByRole('button', { name: 'Save', exact: true }));
    await expect(jobRow).toContainText(DEMO.technician);
    await page.waitForTimeout(PAUSE_AFTER_CHANGE);
  });

  await test.step('job card: approve', async () => {
    await press(jobRow.getByRole('button', { name: 'Approve', exact: true }));
    await expect(jobRow).toContainText('Approved');
    await page.waitForTimeout(PAUSE_AFTER_CHANGE);
  });

  await test.step('repair order: findings, parts and labor', async () => {
    await openModule(page, 'Repair Orders');
    await page.getByPlaceholder('Search RO, customer, vehicle…').fill(DEMO.roNumber);
    const ro = page.getByText(DEMO.roNumber, { exact: true }).first();
    await expect(ro).toBeVisible();
    await press(ro);
    await expect(page.getByText('Check-engine light and reduced engine power').first()).toBeVisible();
    await expect(page.getByText(/Charge-air pressure fault/).first()).toBeVisible();
    await expect(page.getByText(/Replace intercooler boost hose/).first()).toBeVisible();
    await expect(page.getByText('Intercooler boost hose', { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(PAUSE_AFTER_NAVIGATION);
  });

  await test.step('repair order: move through its real statuses', async () => {
    // The detail view's status control is the only select offering "Pending Parts".
    const status = page.locator('select').filter({ has: page.locator('option[value="Pending Parts"]') });
    await expect(status).toHaveCount(1);
    for (const next of ['In Progress', 'Pending Parts', 'In Progress', 'Pending Approval']) {
      await status.selectOption(next);
      await expect(status).toHaveValue(next);
      await page.waitForTimeout(PAUSE_AFTER_CHANGE);
    }
  });

  await test.step('repair order: QA sign-off to Complete', async () => {
    const status = page.locator('select').filter({ has: page.locator('option[value="Pending Parts"]') });
    await press(page.getByRole('button', { name: /QA Sign-Off/ }));
    const passes = page.getByRole('button', { name: '✓ PASS', exact: true });
    const total = await passes.count();
    expect(total).toBeGreaterThan(0);
    for (let i = 0; i < total; i++) await press(passes.nth(i));
    await page.getByPlaceholder('Type your full name to sign off…').fill('Demo Service Advisor');
    await press(page.getByRole('button', { name: /Approve — Mark Complete/ }));
    // The status control itself, not any text containing "Complete" (the
    // sign-off button says "Mark Complete").
    await expect(status).toHaveValue('Complete');
    await page.waitForTimeout(PAUSE_AFTER_CHANGE);
  });

  await test.step('Command Center', async () => {
    await openModule(page, 'Command Center');
    await page.waitForTimeout(PAUSE_ON_FINAL_VIEW);
  });

  // Closing the page finalises the video; saveAs waits for that.
  const video = page.video();
  await page.close();
  if (video) {
    mkdirSync('marketing-output', { recursive: true });
    await video.saveAs(OUTPUT_WEBM);
  }
});

test.afterAll(async ({}, testInfo) => {
  if (!started) return; // start gates never passed; nothing ran
  const after = await collectGateFacts(testInfo.project.use.baseURL);
  const finish = evaluateFinishGates(before, after);
  if (!finish.ok) {
    throw new Error(`[marketing-capture] run finished but production is not as expected:\n  - ${finish.failures.join('\n  - ')}`);
  }
  // Keep a copy named for the date, so a second take never overwrites the first.
  try {
    copyFileSync(OUTPUT_WEBM, OUTPUT_WEBM.replace('.webm', `-${new Date().toISOString().slice(0, 10)}.webm`));
  } catch { /* no video when the run stopped early */ }
});
