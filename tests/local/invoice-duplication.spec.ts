/**
 * Phase 9 — invoice safety.
 *
 * Runs entirely inside a throwaway tenant that this file creates and deletes,
 * so no invoice is ever raised against a real shop's books. That matters more
 * than usual here: an invoice is a financial record, and a test that leaves one
 * behind has corrupted the thing it was checking.
 *
 * The question is not whether two invoices can share a number — invoices.number
 * is the table's primary key, so the database makes that impossible. It is
 * whether one repair order can end up billed twice under two different numbers,
 * which the primary key does nothing to prevent.
 *
 * Run: npm run test:local
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createSyntheticShop, destroySyntheticShop, type SyntheticShop } from '../helpers/synthetic-shop';

let shop: SyntheticShop;
let admin: SupabaseClient;

const RO_NUMBER = 'RO-90001';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  shop = await createSyntheticShop('invoice-dup');
  admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // A completed repair order with real money on it, so a duplicate would be
  // an actual double bill rather than two empty drafts.
  const { error } = await admin.from('repair_orders').insert({
    shop_id: shop.shopId,
    ro_number: RO_NUMBER,
    customer_name: 'Duplication Test Customer',
    vehicle: 'Test Vehicle 2020',
    status: 'Complete',
    concern: 'brake noise',
    correction: 'replaced front pads',
    labor_hours: 2,
    labor_rate: 100,
    parts_total: 50,
    currency: 'USD',
  });
  if (error) throw new Error(`could not seed the repair order: ${error.message}`);
});

test.afterAll(async () => {
  if (admin && shop) await admin.from('repair_orders').delete().eq('shop_id', shop.shopId);
  if (shop) await destroySyntheticShop(shop);
});

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', shop.email);
  await page.fill('input[type="password"]', shop.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 25_000 });
}

async function invoiceCount(): Promise<number> {
  const { data, error } = await admin.from('invoices').select('number').eq('shop_id', shop.shopId);
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}

test('the allocator never hands the same number to two callers', async () => {
  // The property the whole scheme rests on. Ten concurrent allocations must
  // produce ten distinct numbers; a read-then-increment would collide here.
  const results = await Promise.all(
    Array.from({ length: 10 }, () => admin.rpc('next_document_number', { p_shop_id: shop.shopId, p_doc_type: 'invoice' })),
  );
  const values = results.map(r => r.data).filter(v => v !== null && v !== undefined);
  expect(values.length, 'every allocation should succeed').toBe(10);
  expect(new Set(values).size, `duplicate numbers issued: ${values.join(', ')}`).toBe(10);
});

test('invoice numbers are unique across shops, not just within one', async () => {
  // invoices.number is the primary key, so a per-shop counter would collide
  // the moment one shop caught up with another. This is what that guarantees.
  const a = await admin.rpc('next_document_number', { p_shop_id: shop.shopId, p_doc_type: 'invoice' });
  const { data: existing } = await admin.from('invoices').select('number');
  const taken = new Set((existing ?? []).map(r => String(r.number)));
  expect(taken.has(`INV-${String(a.data).padStart(4, '0')}`),
    'the allocator handed out a number that already exists').toBe(false);
});

test('double-clicking Convert cannot bill the job twice', async ({ page }) => {
  await signIn(page);
  const before = await invoiceCount();

  page.on('dialog', d => d.accept()); // the convert confirm
  await page.getByRole('button', { name: /^Repair Orders/ }).click();
  await page.getByText(RO_NUMBER).first().click();

  const convert = page.getByRole('button', { name: /Convert to invoice|raise invoice/i }).first();
  await expect(convert).toBeVisible({ timeout: 15_000 });

  // Two clicks as fast as the browser will deliver them.
  await Promise.all([convert.click(), convert.click().catch(() => {})]);
  await page.waitForTimeout(4000);

  expect(await invoiceCount(), 'two invoices were created from one repair order').toBe(before + 1);
});

test('reloading and converting again does not bill it a second time', async ({ page }) => {
  await signIn(page);
  const before = await invoiceCount();

  page.on('dialog', d => d.accept());
  await page.getByRole('button', { name: /^Repair Orders/ }).click();
  await page.getByText(RO_NUMBER).first().click();

  // The order already carries an invoice number from the previous test, so the
  // guard should refuse. A reload is what makes this worth testing: it clears
  // any client state the guard might have been relying on.
  await page.reload();
  await page.getByRole('button', { name: /^Repair Orders/ }).click();
  await page.getByText(RO_NUMBER).first().click();

  const convert = page.getByRole('button', { name: /Convert to invoice|raise invoice/i }).first();
  if (await convert.isVisible().catch(() => false)) {
    await convert.click();
    await page.waitForTimeout(3000);
  }

  expect(await invoiceCount(), 'a reload allowed the job to be billed twice').toBe(before);
});

test('two browser contexts cannot both bill the same job', async ({ browser }) => {
  const before = await invoiceCount();

  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map(c => c.newPage()));

  try {
    for (const p of pages) {
      p.on('dialog', d => d.accept());
      await signIn(p);
      await p.getByRole('button', { name: /^Repair Orders/ }).click();
      await p.getByText(RO_NUMBER).first().click();
    }

    // Both sessions loaded the order before either converted, so each holds
    // state saying it is unbilled — the client guard cannot help here, and
    // whatever protection exists has to come from the server.
    await Promise.all(pages.map(async p => {
      const b = p.getByRole('button', { name: /Convert to invoice|raise invoice/i }).first();
      if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
    }));
    await new Promise(r => setTimeout(r, 5000));

    expect(await invoiceCount(), 'two sessions each raised an invoice for one job').toBe(before);
  } finally {
    await Promise.all(contexts.map(c => c.close()));
  }
});
