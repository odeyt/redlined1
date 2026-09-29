/**
 * Internal reminders — create, edit, complete, reopen, cancel and filter, at
 * desktop and phone widths.
 *
 * Needs a target where supabase/migrations/2026-09-29_internal_reminders.sql
 * has been applied AND the internal_reminders flag is enabled for the test
 * owner's shop. Neither is true anywhere by default, so the suite skips unless
 * REMINDERS_E2E=1 is set — and it refuses to run against production at all.
 *
 * Reminders cannot be deleted by design, so each run leaves cancelled rows
 * titled "E2E Reminder <timestamp>" in the test shop.
 *
 *   REMINDERS_E2E=1 TEST_MODE=local npx playwright test tests/reminders --project=chromium
 */
import { test, expect, type Page } from '@playwright/test';
import { navigateTo } from '../helpers/auth';

const enabled = process.env.REMINDERS_E2E === '1';
const production = process.env.TEST_MODE === 'production' || /redlined1\.com/.test(process.env.TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? '');

test.skip(!enabled, 'Set REMINDERS_E2E=1 on a target with the reminders migration applied and the flag enabled.');
test.skip(production, 'Reminders E2E never runs against production.');

async function openReminders(page: Page) {
  await page.goto('/');
  await navigateTo(page, 'Reminders');
  await expect(page.getByRole('heading', { name: 'Reminders', level: 1 })).toBeVisible({ timeout: 15_000 });
}

async function openTab(page: Page, name: RegExp) {
  await page.getByRole('tab', { name }).click();
}

function row(page: Page, title: string) {
  return page.getByRole('listitem').filter({ hasText: title });
}

for (const viewport of [
  { name: 'desktop', size: { width: 1280, height: 800 } },
  { name: 'mobile', size: { width: 390, height: 844 } },
]) {
  test.describe(`Reminders (${viewport.name})`, () => {
    test.use({ viewport: viewport.size });

    test('create, edit, complete, reopen and cancel a reminder', async ({ page }) => {
      const title = `E2E Reminder ${viewport.name} ${Date.now()}`;
      await openReminders(page);

      // Create — the default due time is tomorrow 09:00, so it lands in Upcoming.
      await page.getByRole('button', { name: '+ New reminder' }).click();
      const dialog = page.getByRole('dialog', { name: 'New reminder' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel('What needs doing?')).toBeFocused();
      await dialog.getByLabel('What needs doing?').fill(title);
      await dialog.getByLabel('Priority').selectOption('high');
      await dialog.getByRole('button', { name: 'Add reminder' }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText('Reminder added.')).toBeVisible();

      await openTab(page, /^Upcoming/);
      await expect(row(page, title)).toBeVisible();
      await expect(row(page, title)).toContainText('High priority');
      await expect(row(page, title)).toContainText('Upcoming');   // a word, not only a colour

      // Edit
      const edited = `${title} (edited)`;
      await row(page, title).getByRole('button', { name: /^Edit/ }).click();
      const editDialog = page.getByRole('dialog', { name: 'Edit reminder' });
      await editDialog.getByLabel('What needs doing?').fill(edited);
      await editDialog.getByRole('button', { name: 'Save changes' }).click();
      await expect(row(page, edited)).toBeVisible();

      // Complete → history
      await row(page, edited).getByRole('button', { name: /done/i }).click();
      await expect(page.getByText('Marked done.')).toBeVisible();
      await openTab(page, /^Completed/);
      await expect(row(page, edited)).toContainText('Done');

      // History records the steps
      await row(page, edited).getByRole('button', { name: 'History' }).click();
      await expect(row(page, edited)).toContainText('Created');
      await expect(row(page, edited)).toContainText('Completed');

      // Reopen → back to Upcoming
      await row(page, edited).getByRole('button', { name: /^Reopen/ }).click();
      await expect(page.getByText('Reopened.')).toBeVisible();
      await openTab(page, /^Upcoming/);
      await expect(row(page, edited)).toBeVisible();

      // Cancel → history, marked as cancelled
      page.once('dialog', d => d.accept());
      await row(page, edited).getByRole('button', { name: /^Cancel/ }).click();
      await expect(page.getByText('Cancelled.')).toBeVisible();
      await openTab(page, /^Completed/);
      await expect(row(page, edited)).toContainText('Cancelled');
    });

    test('validation keeps the dialog open and explains why', async ({ page }) => {
      await openReminders(page);
      await page.getByRole('button', { name: '+ New reminder' }).click();
      const dialog = page.getByRole('dialog', { name: 'New reminder' });
      await dialog.getByRole('button', { name: 'Add reminder' }).click();
      await expect(dialog.getByRole('alert')).toContainText('Give the reminder a title');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    });

    test('the tabs are keyboard reachable and filter the list', async ({ page }) => {
      await openReminders(page);
      const tabs = page.getByRole('tab');
      await expect(tabs).toHaveCount(4);
      await openTab(page, /^Overdue/);
      await expect(page.getByRole('tab', { name: /^Overdue/ })).toHaveAttribute('aria-selected', 'true');
      await openTab(page, /^Due today/);
      await expect(page.getByRole('tab', { name: /^Due today/ })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('tabpanel')).toBeVisible();
    });
  });
}
