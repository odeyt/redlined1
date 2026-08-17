/**
 * Does a real user action actually produce an audit row?
 *
 * This test exists because that question cost a working day. `audit_events`
 * sat empty from M1 through M5 while five separate theories were investigated
 * — a missing grant, capability resolution, the RPC signature — and the answer
 * turned out to be a browser running months-old JavaScript. Every check along
 * the way was manual: edit a customer, ask the operator what they saw, query
 * the database, guess again.
 *
 * The loop is now: create → update → archive a customer through the real UI,
 * and assert the trail records each one with the right actor. It runs against
 * the audit account's own shop, never D1's.
 *
 * Gated on E2E_ALLOW_MUTATIONS, because it writes. `audit_events` is
 * append-only by design, so the rows it produces are permanent — that is the
 * point of the table, and they are honest history of what this test did.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../.auth/audit-user.json') });

const MUTATIONS_ALLOWED = process.env.E2E_ALLOW_MUTATIONS === 'true';

/** A name this run can find again, and a human can recognise in the UI. */
const MARKER = `[E2E] Audit ${Date.now()}`;

/**
 * Opens the Customers screen the way a person does.
 *
 * The app is one page with the active module in reducer state, so there is no
 * URL for a screen. Clicking the sidebar is not a detail of the test — it is
 * the only way in.
 */
async function openCustomers(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: /^customers$/i })
    .or(page.locator("nav, aside").getByText(/^customers$/i))
    .first()
    .click();
  await page.getByRole("button", { name: "+ Add Customer" }).waitFor({ timeout: 20000 });
}

/**
 * Waits for a row to appear, rather than reading immediately after a click.
 *
 * The first version of this test read the database the instant the Save button
 * was clicked and failed because the insert had not landed — the same race it
 * already guarded against for audit rows, and then did not apply to the record
 * itself.
 */
async function waitForRow(
  db: SupabaseClient, table: string, column: string, value: string, timeoutMs = 20_000,
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await db.from(table).select('*').eq(column, value).limit(1);
    if (data && data.length > 0) return data[0] as Record<string, unknown>;
    await new Promise(r => setTimeout(r, 750));
  }
  return null;
}

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * Waits for an audit row, rather than asserting immediately.
 *
 * The write and the audit are two round trips from the browser; asserting the
 * instant the UI settles is a race the test would lose intermittently, and an
 * intermittent audit test is worse than none — it teaches people to re-run.
 */
async function waitForAuditRow(
  db: SupabaseClient,
  action: string,
  entityId: string,
  timeoutMs = 15_000,
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await db
      .from('audit_events')
      .select('*')
      .eq('action', action)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (data && data.length > 0) return data[0] as Record<string, unknown>;
    await new Promise(r => setTimeout(r, 750));
  }
  return null;
}

test.describe('the audit trail records real user actions', () => {
  test.skip(!MUTATIONS_ALLOWED, 'E2E_ALLOW_MUTATIONS is not true — this test writes');
  test.skip(!admin(), 'service role key not available to read audit_events');
  // Three UI round trips plus polling.
  test.setTimeout(120_000);

  test('creating, editing and archiving a customer each leave a row @audit', async ({ page }) => {
    const db = admin()!;

    // ── The build actually running ──────────────────────────────────────────
    // Recorded first because the whole reason this test exists is a browser
    // running old code. If it ever fails, this line says whether the failure
    // is about the app or about the bundle.
    await page.goto('/');
    const build = await page.evaluate(() =>
      (document.querySelector('meta[name="build"]') as HTMLMetaElement)?.content ?? 'unknown');
    const server = await (await page.request.get('/api/ping')).json();
    console.log(`[audit-trail] page build=${build} server=${server.commit}`);

    // ── Create ──────────────────────────────────────────────────────────────
    // Navigate the way a person does. There is no ?module= deep link — the
    // shell keeps the active module in reducer state and only understands
    // ?alert=, which was added for notifications. Assuming otherwise is what
    // made the first run of this test fail on the dashboard.
    await openCustomers(page);
    await page.getByRole('button', { name: '+ Add Customer' }).click();
    await page.getByPlaceholder('Customer or business name').fill(MARKER);
    await page.getByRole('button', { name: 'Save Customer' }).click();

    // The id is not shown in the list, so it is read back from the database by
    // the marker this run wrote — polled, because the insert is in flight.
    const created = await waitForRow(db, 'customers', 'name', MARKER);
    expect(created, 'customer was created').toBeTruthy();
    const customerId = created!.id as string;

    const createdRow = await waitForAuditRow(db, 'customer.created', customerId);
    expect(createdRow, 'customer.created was audited').toBeTruthy();
    expect(createdRow!.actor_type).toBe('user');
    expect(createdRow!.actor_user_id, 'the row names a real person').toBeTruthy();
    expect(createdRow!.shop_id, 'scoped to the acting shop').toBe(created!.shop_id);

    // ── Update ──────────────────────────────────────────────────────────────
    await openCustomers(page);
    await page.locator('tr', { hasText: MARKER }).first()
      .getByRole('button', { name: /^edit$/i }).click();
    // The drawer's labels are siblings of their inputs with no htmlFor, so
    // getByLabel cannot find them — worth fixing in the app for screen readers
    // as much as for tests. Selecting by the field wrapper until then.
    await page.locator('.login-field').filter({ hasText: /^Phone$/ }).locator('input')
      .first().fill('020 5550100');
    await page.getByRole('button', { name: 'Update Customer' }).first().click();

    const updatedRow = await waitForAuditRow(db, 'customer.updated', customerId);
    expect(updatedRow, 'customer.updated was audited').toBeTruthy();
    expect(updatedRow!.before_data, 'the row says what it was').toBeTruthy();
    expect(updatedRow!.after_data, 'and what it became').toBeTruthy();

    // ── Archive ─────────────────────────────────────────────────────────────
    // Leaves the shop tidy as a side effect: an archived customer is out of
    // every picker, which is what a synthetic record should be.
    page.once('dialog', d => d.accept('E2E run'));
    await openCustomers(page);
    await page.locator('tr', { hasText: MARKER }).first()
      .getByRole('button', { name: /^archive$/i }).click();

    const archivedRow = await waitForAuditRow(db, 'customer.archived', customerId);
    expect(archivedRow, 'customer.archived was audited').toBeTruthy();
  });

  test('a save that changes nothing is not recorded @audit', async ({ page }) => {
    // The counterpart guarantee. Two identical customer.updated rows reached
    // the production trail before this was fixed, and a log full of no-ops is
    // harder to scan than one carrying only real edits.
    const db = admin()!;
    const { data: existing } = await db
      .from('customers').select('id, name').ilike('name', '[E2E]%').limit(1);
    test.skip(!existing?.length, 'no synthetic customer to re-save');

    const id = existing![0].id as string;
    const { count: before } = await db
      .from('audit_events').select('*', { count: 'exact', head: true })
      .eq('entity_id', id).eq('action', 'customer.updated');

    await openCustomers(page);
    const row = page.locator('tr', { hasText: existing![0].name as string }).first();
    await row.getByRole('button', { name: /^edit$/i }).click();
    await page.getByRole('button', { name: 'Update Customer' }).first().click();
    await page.waitForTimeout(3000);

    const { count: after } = await db
      .from('audit_events').select('*', { count: 'exact', head: true })
      .eq('entity_id', id).eq('action', 'customer.updated');
    expect(after, 'no new row for a save that changed nothing').toBe(before);
  });
});
