/**
 * Regression: RO internal notes must not leak into Damage at Intake, and a
 * saved Issues value must survive reopening the vehicle form (auto-pull).
 *
 * Seeds its own vehicle + repair order and removes them afterwards. It used to
 * rely on rows left behind by an earlier session, which a later cleanup deleted
 * — the spec then failed for a missing fixture rather than a real regression.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../.auth/audit-user.json') });

const SHOP_ID = '22686099-9931-43a2-82b4-a12fe2d164cf'; // E2E Audit Shop
const VEHICLE = 'E2E Repro Truck #9999';
const RO_NUM  = 'RO-E2E01';
const CUSTOMER = 'E2E Repro Customer';

async function db(): Promise<SupabaseClient> {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error } = await c.auth.signInWithPassword({
    email: process.env.E2E_TRIAL_USER_EMAIL!,
    password: process.env.E2E_TRIAL_USER_PASSWORD!,
  });
  if (error) throw new Error(`seed sign-in failed: ${error.message}`);
  return c;
}

async function removeFixture(c: SupabaseClient) {
  await c.from('repair_orders').delete().eq('shop_id', SHOP_ID).eq('ro_number', RO_NUM);
  await c.from('vehicles').delete().eq('shop_id', SHOP_ID).eq('label', VEHICLE);
  await c.from('customers').delete().eq('shop_id', SHOP_ID).eq('name', CUSTOMER);
}

test.beforeAll(async () => {
  const c = await db();
  const { data: { user } } = await c.auth.getUser();
  await removeFixture(c);

  const customerId = randomUUID();
  await c.from('customers').insert({ id: customerId, name: CUSTOMER, shop_id: SHOP_ID, owner_id: user!.id });

  const { error: vErr } = await c.from('vehicles').insert({
    id: randomUUID(), label: VEHICLE, customer_id: customerId, shop_id: SHOP_ID, owner_id: user!.id,
    make: 'Toyota', model: 'Hilux', year: '2020',
    issues: 'MOVED TEXT: check engine light comes on',
    damage_intake: '',
  });
  if (vErr) throw new Error(`seeding vehicle failed: ${vErr.message}`);

  // The RO carries internal notes that must NOT be pulled into Damage at Intake.
  const { error: rErr } = await c.from('repair_orders').insert({
    id: randomUUID(), ro_number: RO_NUM, vehicle: VEHICLE,
    customer_name: CUSTOMER, customer_id: customerId,
    shop_id: SHOP_ID, owner_id: user!.id, status: 'In Progress',
    concern: 'RO CONCERN TEXT', notes: 'RO INTERNAL NOTES — must NOT appear in damage box',
    opened_date: '2026-07-30',
  });
  if (rErr) throw new Error(`seeding repair order failed: ${rErr.message}`);
});

test.afterAll(async () => {
  await removeFixture(await db());
});

test('Damage at Intake stays empty; saved Issues text survives auto-pull', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.sidebar, aside').first()).toBeVisible({ timeout: 20_000 });

  // Open Vehicles module
  await page.locator('.sidebar button, aside button, .sidebar a, aside a')
    .filter({ hasText: /vehicles/i }).first().click();
  await page.waitForTimeout(1500);

  // Open the repro vehicle
  await page.getByText('E2E Repro Truck #9999').first().click();
  await page.waitForTimeout(3000); // allow auto-pull from RO to run

  // Field values
  const issuesVal = await page.locator('textarea').filter({ hasText: /MOVED TEXT/ }).first()
    .inputValue().catch(async () =>
      // Fallback: locate by preceding label
      page.locator('text=Issues / Work Needed').locator('xpath=following::textarea[1]').inputValue()
    );
  const damageVal = await page
    .locator('text=Damage at Intake').locator('xpath=following::textarea[1]').inputValue();

  console.log('issues =', JSON.stringify(issuesVal));
  console.log('damage =', JSON.stringify(damageVal));

  // Saved issues text preserved — not replaced by 'RO CONCERN TEXT'
  expect(issuesVal).toContain('MOVED TEXT');
  // RO internal notes must NOT be pulled into Damage at Intake
  expect(damageVal).not.toContain('RO INTERNAL NOTES');
  expect(damageVal).toBe('');
});
