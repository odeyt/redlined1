/**
 * The ledger, exercised through the UI.
 *
 * Payments are the part of this system where a silent regression costs actual
 * money, and they are the only ported domain never verified by a real user
 * action — the audit trail was proved for customers and invoices by hand, and
 * payments were left as "same code path, so probably fine". That reasoning is
 * what cost a day earlier.
 *
 * Three properties, all of which are load-bearing:
 *
 *   1. Recording a payment writes a payment.created audit row.
 *   2. Reversing appends the exact opposite entry and audits it against the
 *      ORIGINAL payment, so its history is findable from the entry itself.
 *   3. The original row is still there afterwards. That is what append-only
 *      means, and it is the difference between "paid then reversed" and "never
 *      paid" when somebody reconciles against a bank statement.
 *
 * Runs in the audit account's own shop. Gated on E2E_ALLOW_MUTATIONS because
 * it writes, and the entries it writes are PERMANENT — a ledger has no delete.
 * Amounts are deliberately tiny and the customer name carries the run marker,
 * so the residue is recognisable and harmless.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../.auth/audit-user.json') });

const MUTATIONS_ALLOWED = process.env.E2E_ALLOW_MUTATIONS === 'true';
const MARKER = `[E2E] Ledger ${Date.now()}`;
const AMOUNT = '1.23';

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Polls, because the write and the audit are separate round trips. */
async function waitFor<T>(read: () => Promise<T | null>, timeoutMs = 20_000): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await read();
    if (found) return found;
    await new Promise(r => setTimeout(r, 750));
  }
  return null;
}

/**
 * Payments are reached through an INVOICE, not the Payments screen.
 *
 * The Payments module is not in the free plan's module list, and the audit
 * account is on free — so that screen is legitimately locked for it. Invoices
 * IS free, and recording and reversing from an invoice goes through exactly
 * the same domain code, which is what these assertions are about.
 */
/**
 * The shop the audit account owns. Read rather than hard-coded: the account
 * has been re-provisioned before, and a stale id would make this test fail for
 * a reason that has nothing to do with the ledger.
 */
async function auditShopId(db: SupabaseClient): Promise<string> {
  const { data } = await db.from('shops').select('id').eq('name', 'E2E Audit Shop').limit(1);
  const shopId = data?.[0]?.id as string | undefined;
  if (!shopId) throw new Error('the audit shop is missing — has the account been re-provisioned?');
  return shopId;
}

async function openInvoices(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  // Two things the page snapshot corrected, after three wrong guesses:
  // the nav items are BUTTONS, not links, and this one is labelled
  // "Invoicing", not "Invoices". The count badge is part of the accessible
  // name ("Invoicing 2"), so the match cannot be anchored at the end either.
  await page.getByRole('button', { name: /^Invoicing/ }).first().click();
  // Any of these means the screen rendered: the create button, an existing
  // invoice row, or the empty state.
  await page.getByRole('button', { name: /invoice/i })
    .or(page.locator('tr', { hasText: /^INV-/ }))
    .or(page.getByText(/no invoices/i))
    .first()
    .waitFor({ timeout: 20_000 });
}

test.describe('the payment ledger', () => {
  test.skip(!MUTATIONS_ALLOWED, 'E2E_ALLOW_MUTATIONS is not true — this test writes');
  test.skip(!admin(), 'service role key not available to read the ledger');
  test.setTimeout(120_000);

  test('recording and reversing a payment leaves both entries and both audit rows @audit', async ({ page }) => {
    const db = admin()!;
    const server = await (await page.request.get('/api/ping')).json();
    console.log(`[payment-ledger] server=${server.commit}`);

    // ── An invoice to pay ───────────────────────────────────────────────────
    // Seeded rather than created through the UI: invoice creation is covered by
    // the audit-trail spec, and building one here would make a failure
    // ambiguous between invoicing and the ledger.
    const shopId = await auditShopId(db);
    const invoiceNumber = `INV-${MARKER.slice(-8)}`;
    await db.from('invoices').insert({
      number: invoiceNumber,
      shop_id: shopId,
      customer: MARKER,
      status: 'Draft',
      lines: [{ note: '', description: 'E2E ledger probe', qty: 1, rate: Number(AMOUNT) }],
      discount: 0, shop_supplies: 0, tax_rate: 0, currency: 'USD',
    });

    // ── Record ──────────────────────────────────────────────────────────────
    await openInvoices(page);
    // The invoice list is divs, not a table — the only <table> on the screen is
    // the line-items grid inside the detail pane, so a `tr` selector matched
    // nothing while the invoice was plainly on screen.
    await page.locator('strong', { hasText: invoiceNumber }).first().click();
    await page.getByRole('button', { name: /Mark Paid/i }).click();
    await page.getByRole('button', { name: /Confirm .* Payment/i }).click();

    const payment = await waitFor(async () => {
      const { data } = await db
        .from('payments').select('*')
        .eq('invoice_number', invoiceNumber).eq('entry_type', 'payment').limit(1);
      return data?.[0] ?? null;
    });
    expect(payment, 'the payment was recorded').toBeTruthy();
    expect(Number(payment!.amount)).toBeCloseTo(Number(AMOUNT), 2);

    const created = await waitFor(async () => {
      const { data } = await db
        .from('audit_events').select('*')
        .eq('action', 'payment.created').eq('entity_id', payment!.id as string).limit(1);
      return data?.[0] ?? null;
    });
    expect(created, 'payment.created was audited').toBeTruthy();
    expect(created!.actor_type).toBe('user');
    expect(created!.actor_user_id, 'the row names a real person').toBeTruthy();

    // ── Reverse ─────────────────────────────────────────────────────────────
    // Reversing asks why. A reversal with no explanation is the thing an
    // auditor asks about months later and nobody can answer, so the domain
    // requires a reason even though the column allows null.
    page.once('dialog', d => d.accept('E2E reversal'));
    await openInvoices(page);
    // The invoice list is divs, not a table — the only <table> on the screen is
    // the line-items grid inside the detail pane, so a `tr` selector matched
    // nothing while the invoice was plainly on screen.
    await page.locator('strong', { hasText: invoiceNumber }).first().click();
    // The × beside a recorded payment in the invoice drawer.
    //
    // Both titles accepted on purpose. It said "Remove payment" — stale since
    // M2, when removal became reversal — and this change corrects it, but the
    // test must pass against the build already deployed as well as the one
    // being deployed. A test that only goes green after its own release cannot
    // gate that release.
    await page
      .locator('button[title="Reverse payment"], button[title="Remove payment"]')
      .first()
      .click();

    const reversal = await waitFor(async () => {
      const { data } = await db
        .from('payments').select('*').eq('reverses_payment_id', payment!.id as string).limit(1);
      return data?.[0] ?? null;
    });
    expect(reversal, 'a reversal entry was appended').toBeTruthy();
    expect(reversal!.entry_type).toBe('reversal');
    expect(Number(reversal!.amount), 'the exact negative of the original')
      .toBeCloseTo(-Number(AMOUNT), 2);
    expect(reversal!.currency, 'same currency as the entry it cancels').toBe(payment!.currency);
    expect(reversal!.reason, 'the reason was captured').toBeTruthy();

    const reversed = await waitFor(async () => {
      const { data } = await db
        .from('audit_events').select('*')
        .eq('action', 'payment.reversed').eq('entity_id', payment!.id as string).limit(1);
      return data?.[0] ?? null;
    });
    expect(reversed, 'payment.reversed was audited against the ORIGINAL entry').toBeTruthy();

    // ── Append-only ─────────────────────────────────────────────────────────
    // The point of the whole design: the original entry survives. "Paid 1.23
    // and later reversed" is a different fact from "never paid", and only one
    // of them reconciles against a bank statement.
    const { data: still } = await db.from('payments').select('id, amount').eq('id', payment!.id as string);
    expect(still?.length, 'the original entry is still there').toBe(1);
    expect(Number(still![0].amount), 'and is unchanged').toBeCloseTo(Number(AMOUNT), 2);

    // Net of the pair is zero — what every report sums, and why reversals
    // needed no change to any of them.
    const { data: pair } = await db.from('payments').select('amount').eq('invoice_number', invoiceNumber);
    const net = (pair ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
    expect(net, 'the pair nets to nothing').toBeCloseTo(0, 2);
  });

  test('the ledger refuses to be edited or deleted @audit', async () => {
    // The database half, from outside the app. Not reachable through the UI at
    // all — the buttons that used to do it were removed in M2 — so this is the
    // only way to prove the guarantee still holds.
    const db = admin()!;
    const { data: any } = await db.from('payments').select('id').limit(1);
    test.skip(!any?.length, 'no payment to attempt against');
    const id = any![0].id as string;

    const updated = await db.from('payments').update({ amount: 999 }).eq('id', id);
    expect(updated.error, 'editing a payment is refused').toBeTruthy();

    const deleted = await db.from('payments').delete().eq('id', id);
    expect(deleted.error, 'deleting a payment is refused').toBeTruthy();

    const { data: after } = await db.from('payments').select('amount').eq('id', id);
    expect(Number(after![0].amount), 'and the entry is untouched').not.toBe(999);
  });
});
