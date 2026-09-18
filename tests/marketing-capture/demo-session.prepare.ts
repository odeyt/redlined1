/**
 * Saves the demo owner's session for the capture. Off camera; no video.
 *
 *   npm run capture:marketing:prepare
 *
 * Named *.prepare.ts, not auth.setup.ts: playwright.config.ts's `setup` project
 * matches /auth\.setup\.ts/ anywhere, and would sweep this file into the normal
 * regression run.
 *
 * The credential comes from the file seed-demo-tenant.ts wrote outside the
 * repository. Neither the email nor the password is printed.
 *
 * The request ledger (tests/marketing-capture/request-ledger.ts) is installed
 * before the first navigation: Google Analytics and Sentry are blocked, and the
 * only mutation allowed is the sign-in itself. The session is not saved if the
 * ledger records anything that fails a take.
 */
import { test as prepare, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import { DEMO } from '@/lib/marketing-capture/gates';
import { CREDENTIAL_FILE } from '../../scripts/marketing/credential-path';
import { DEMO_AUTH_STATE, sessionUserIdFromAuthState } from './gate-facts';
import { installLedger, ledgerReport } from './request-ledger';

prepare('save the demo owner session', async ({ page }) => {
  expect(existsSync(CREDENTIAL_FILE), 'demo credential file is missing; run the seed first').toBe(true);
  const { email, password } = JSON.parse(readFileSync(CREDENTIAL_FILE, 'utf8')) as { email: string; password: string };
  // Only the dedicated demo account may ever be saved here.
  expect(email === DEMO.ownerEmail, 'credential file is not for the demo owner').toBe(true);

  const ledger = await installLedger(page.context(), 'prepare');

  // Same selectors as tests/auth/auth.setup.ts and tests/helpers/auth.ts.
  await page.goto('/login');
  await expect(page.locator('#email')).toBeVisible({ timeout: 20_000 });
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('.login-btn');
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 30_000 });

  await page.waitForLoadState('networkidle');
  const { failures } = ledgerReport(ledger);
  expect(failures, 'request ledger recorded a request that fails a take; session not saved').toEqual([]);

  await page.context().storageState({ path: DEMO_AUTH_STATE });
  expect(sessionUserIdFromAuthState(), 'saved session has no readable user').not.toBeNull();
});
