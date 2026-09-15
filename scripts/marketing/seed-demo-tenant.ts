/**
 * Creates — or checks — the ONE production demo tenant used by the marketing capture.
 *
 *   npx tsx scripts/marketing/seed-demo-tenant.ts
 *
 * ## Two modes, chosen by whether MARKETING_DEMO_SHOP_ID is set
 *
 *   CREATE  (unset)  Creates the owner, organization, shop and fictional records.
 *                    Refuses outright if ANY demo identifier already exists
 *                    anywhere in production — it never adopts a record it did not
 *                    make, and it never selects a shop by name.
 *
 *   REPAIR  (set)    Works inside that exact shop only. Creates a missing demo
 *                    record; reports one that differs; never updates, never
 *                    deletes, never touches another shop.
 *
 * ## What it will not do
 *
 * - Run without ALLOW_PRODUCTION_MARKETING_SEED=true.
 * - Run before the shops.is_synthetic migration: the shop must be born excluded
 *   from growth reporting, not excluded afterwards.
 * - Send email. The owner is created with auth.admin.createUser and
 *   email_confirm: true, which delivers nothing (the same call the approved
 *   tests/helpers/synthetic-shop.ts uses). /signup and /api/invite, which DO
 *   send, are not used.
 * - Print the password. It is written once to a file outside the repository,
 *   readable only by the current Windows account, and read back by the
 *   session-prepare step. It is never logged or committed.
 * - Queue Sapelee events. Those are published by the browser-side services; this
 *   script writes through the service-role client, which publishes nothing.
 * - Draw on the shared invoice sequence. The demo invoice uses a fixed,
 *   non-sequence number (see DEMO.invoiceNumber).
 */
import { randomBytes } from 'crypto';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { config as loadDotenv } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ALERT_ROLES, eventsForRole, type AlertPreferences } from '../../lib/alerts/catalogue';
import { DEMO, syntheticShopReadBackFailure } from '../../lib/marketing-capture/gates';
import { PRODUCTION_REF } from '../../tests/helpers/db-target';

import { CREDENTIAL_FILE } from './credential-path';

loadDotenv({ path: join(__dirname, '..', '..', '.env.local') });

/** Fictional content. Nothing here is copied from any real customer, vehicle or job. */
const CONTENT = {
  concern: 'Check-engine light and reduced engine power',
  cause: 'Charge-air pressure fault. Smoke test found a boost leak at a split intercooler boost hose.',
  correction: 'Replace intercooler boost hose, clear stored fault codes, road test under load.',
  mileage: '84250',
  shopAddress: '1 Demo Street, Sample City',
  shopPhone: '000-000-0000',
  part: { description: 'Intercooler boost hose', partNumber: 'DEMO-IBH-001', qty: 1, unitCost: 95 },
  laborRate: 120,
} as const;

function fail(message: string): never {
  console.error(`\n[seed-demo] REFUSED: ${message}\nNothing further was written.`);
  process.exit(1);
}

function db(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) fail('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(`https://${PRODUCTION_REF}.supabase.co`, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Every alert muted for every role: the stored shape is "muted event ids per role". */
function allAlertsMuted(): AlertPreferences {
  return Object.fromEntries(ALERT_ROLES.map(role => [role, eventsForRole(role).map(e => e.id)])) as AlertPreferences;
}

/** Writes the credential outside the repo and restricts it to this account. */
function storeCredential(email: string, password: string) {
  mkdirSync(join(homedir(), '.redlined1-marketing'), { recursive: true });
  writeFileSync(CREDENTIAL_FILE, JSON.stringify({ email, password }), { encoding: 'utf8', mode: 0o600 });
  if (process.platform === 'win32') {
    const user = process.env.USERNAME;
    if (!user) fail('USERNAME is not set; cannot restrict the credential file');
    execFileSync('icacls', [CREDENTIAL_FILE, '/inheritance:r', '/grant:r', `${user}:F`], { stdio: 'ignore' });
  }
}

/** `keyColumn` because not every table has an `id`: invoices is keyed on `number`. */
async function count(client: SupabaseClient, table: string, column: string, value: string, keyColumn = 'id'): Promise<number> {
  const r = await client.from(table).select(keyColumn, { count: 'exact', head: true }).eq(column, value);
  if (r.error || r.count === null) fail(`could not check ${table}.${column}: ${r.error?.message ?? 'no count'}`);
  return r.count;
}

/**
 * Reads the shop back from the database and refuses unless it is provably the
 * synthetic demo shop. Called before every write into a shop, on both paths.
 */
async function confirmSyntheticShop(client: SupabaseClient, shopId: string) {
  const readBack = await client.from('shops').select('id, name, is_synthetic').eq('id', shopId).maybeSingle();
  const failure = syntheticShopReadBackFailure(readBack, shopId);
  if (failure) fail(`${failure}; refusing to write demo records`);
}

async function preflight(client: SupabaseClient) {
  if (process.env.ALLOW_PRODUCTION_MARKETING_SEED !== 'true') fail('ALLOW_PRODUCTION_MARKETING_SEED is not exactly "true"');

  const col = await client.from('shops').select('is_synthetic').limit(0);
  if (col.error) fail('shops.is_synthetic does not exist yet. Apply 2026-09-15_shops_is_synthetic.sql first.');
}

async function create(client: SupabaseClient) {
  // Refuse on ANY collision. A pre-existing record with a demo identifier is
  // either a previous half-run or somebody's real data; neither may be adopted.
  const collisions = {
    shopsNamed: await count(client, 'shops', 'name', DEMO.shopName),
    customersNamed: await count(client, 'customers', 'name', DEMO.customer),
    vehiclesWithPlate: await count(client, 'vehicles', 'plate', DEMO.plate),
    techniciansNamed: await count(client, 'technicians', 'name', DEMO.technician),
    repairOrders: await count(client, 'repair_orders', 'ro_number', DEMO.roNumber),
    invoices: await count(client, 'invoices', 'number', DEMO.invoiceNumber, 'number'),
  };
  if (Object.values(collisions).some(n => n > 0)) fail(`demo identifiers already exist: ${JSON.stringify(collisions)}`);

  for (let page = 1; page < 100; page++) {
    const r = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (r.error) fail(`could not list users: ${r.error.message}`);
    if (r.data.users.some(u => u.email?.toLowerCase() === DEMO.ownerEmail)) fail('the demo owner account already exists');
    if (r.data.users.length < 1000) break;
  }
  if (existsSync(CREDENTIAL_FILE)) fail('the demo credential file (.redlined1-marketing/demo-owner.json in your user profile) already exists; remove it deliberately if a new owner is intended');

  const password = randomBytes(24).toString('base64url');
  const user = await client.auth.admin.createUser({ email: DEMO.ownerEmail, password, email_confirm: true });
  if (user.error || !user.data.user) fail(`createUser failed: ${user.error?.message}`);
  storeCredential(DEMO.ownerEmail, password);
  const userId = user.data.user.id;

  const slug = `demo-redlined1-mktg-${randomBytes(4).toString('hex')}`;
  const org = await client.from('organizations').insert({ name: DEMO.shopName, slug: `${slug}-org` }).select('id').single();
  if (org.error) fail(`organization insert failed: ${org.error.message}`);

  const shop = await client.from('shops')
    .insert({ name: DEMO.shopName, slug, organization_id: org.data.id, is_synthetic: true })
    .select('id').single();
  if (shop.error) fail(`shop insert failed: ${shop.error.message}`);
  const shopId: string = shop.data.id;
  // From here on the shop exists. Report its id even if a later step fails, so
  // a REPAIR run can finish the job inside it rather than a CREATE run
  // colliding with it.
  console.log(`[seed-demo] demo shop created: ${shopId}`);

  // Proven from the database, not assumed from the insert payload.
  await confirmSyntheticShop(client, shopId);

  const member = await client.from('shop_users').insert({ user_id: userId, shop_id: shopId, role: 'owner' });
  if (member.error) fail(`owner membership failed: ${member.error.message}`);

  // Free Forever, exactly as tests/helpers/synthetic-shop.ts provisions an owner.
  const profile = await client.from('profiles').update({ plan: 'free', trial_ends_at: null }).eq('id', userId);
  if (profile.error) fail(`profile update failed: ${profile.error.message}`);

  await ensureRecords(client, shopId);
}

async function ensureRecords(client: SupabaseClient, shopId: string) {
  // Re-checked here as well, so no caller can write demo records into a shop
  // that has not been read back as synthetic.
  await confirmSyntheticShop(client, shopId);

  // shops_create_settings made a blank row; give it a fictional identity so the
  // "complete your shop profile" card is not on camera, and mute every alert.
  const settings = await client.from('shop_settings').update({
    company_name: DEMO.shopName,
    address: CONTENT.shopAddress,
    phone: CONTENT.shopPhone,
    default_currency: 'USD',
    alert_preferences: allAlertsMuted(),
  }).eq('shop_id', shopId).select('shop_id');
  if (settings.error || settings.data?.length !== 1) fail(`shop settings update did not apply to exactly one row: ${settings.error?.message ?? settings.data?.length}`);

  const findOne = async (table: string, column: string, value: string) => {
    const r = await client.from(table).select('*').eq('shop_id', shopId).eq(column, value);
    if (r.error) fail(`${table} lookup failed: ${r.error.message}`);
    if ((r.data ?? []).length > 1) fail(`${table}: more than one "${value}" in the demo shop`);
    return (r.data ?? [])[0] as Record<string, unknown> | undefined;
  };
  const insertOne = async (table: string, row: Record<string, unknown>) => {
    const r = await client.from(table).insert({ shop_id: shopId, ...row }).select('*').single();
    if (r.error) fail(`${table} insert failed: ${r.error.message}`);
    console.log(`[seed-demo] created ${table}`);
    return r.data as Record<string, unknown>;
  };

  const technician = await findOne('technicians', 'name', DEMO.technician) ?? await insertOne('technicians', {
    name: DEMO.technician, role: 'Diagnostics Specialist', pay_type: 'Hourly', status: 'Active',
    phone: null, email: null, user_id: null,
  });

  const customer = await findOne('customers', 'name', DEMO.customer) ?? await insertOne('customers', {
    name: DEMO.customer, phone: null, email: null, address: null,
  });

  if (!(await findOne('vehicles', 'plate', DEMO.plate))) {
    await insertOne('vehicles', {
      customer_id: customer.id, label: DEMO.vehicleLabel, year: '2021', make: 'BMW', model: '330i',
      plate: DEMO.plate, mileage: CONTENT.mileage, vin: null, status: 'Open Job',
    });
  }

  // Mirrors createJobCard() in services/jobCardService.ts. No technician yet:
  // the walkthrough assigns Alex Morgan on camera, through the edit form.
  const jobCard = await findOne('job_cards', 'customer', DEMO.customer) ?? await insertOne('job_cards', {
    ro: DEMO.roNumber, invoice: null, customer: DEMO.customer, vehicle: DEMO.vehicleLabel,
    service_type: 'Diagnostics', channel: 'Shop bay', location: '', technicians: [],
    status: 'Booked', priority: 'Normal', approval: 'Pending', labor_hours: 0, parts_total: 0,
    workflow: ['Booked'], next_action: 'Request approval', check_in_date: new Date().toISOString(),
    notes: CONTENT.concern,
  });

  // Draft only. Its fixed number is what keeps QA sign-off off the shared
  // sequence: draftInvoiceFor() runs only when the repair order has no invoice.
  // Mirrors the invoice domain insert (lib/domain), which lets the database fill
  // invoice_number and customer_name.
  const invoice = await findOne('invoices', 'number', DEMO.invoiceNumber) ?? await insertOne('invoices', {
    number: DEMO.invoiceNumber, customer: DEMO.customer, customer_id: customer.id, vehicle: DEMO.vehicleLabel,
    job_card: jobCard.id, status: 'Draft', currency: 'USD', discount: 0, shop_supplies: 0, tax_rate: 0,
    notes: 'Demo draft for the marketing walkthrough. Never sent.', due_date: null,
    lines: [
      ['Charge-air system diagnosis and boost leak test', 1, CONTENT.laborRate],
      [CONTENT.part.description, CONTENT.part.qty, CONTENT.part.unitCost],
      ['Replace intercooler boost hose', 0.5, CONTENT.laborRate],
    ],
  });

  const ro = await findOne('repair_orders', 'ro_number', DEMO.roNumber) ?? await insertOne('repair_orders', {
    ro_number: DEMO.roNumber, job_card_id: jobCard.id, invoice_number: invoice.number,
    customer_name: DEMO.customer, customer_id: customer.id, vehicle: DEMO.vehicleLabel,
    status: 'Open', concern: CONTENT.concern, cause: CONTENT.cause, correction: CONTENT.correction,
    technician: DEMO.technician, labor_hours: 1.5, labor_rate: CONTENT.laborRate, currency: 'USD',
    parts: [CONTENT.part], parts_total: CONTENT.part.qty * CONTENT.part.unitCost,
    work_lines: [
      { description: 'Charge-air system diagnosis and boost leak test', type: 'Diagnostic', qty: 1, rate: CONTENT.laborRate },
      { description: 'Replace intercooler boost hose', type: 'Labor', qty: 0.5, rate: CONTENT.laborRate },
    ],
    opened_date: new Date().toISOString(),
  });

  // Link the invoice back to its repair order now that both exist.
  if (!invoice.repair_order_id) {
    const link = await client.from('invoices').update({ repair_order_id: ro.id })
      .eq('shop_id', shopId).eq('number', DEMO.invoiceNumber).select('number');
    if (link.error || link.data?.length !== 1) fail('could not link the demo invoice to its repair order');
  }

  // Drift is reported, never "fixed": an edit made on camera is not a defect.
  if (ro.invoice_number !== DEMO.invoiceNumber) fail(`repair order carries ${String(ro.invoice_number)}, not ${DEMO.invoiceNumber}`);
  if (technician.user_id) fail('the demo technician is linked to a login');
  if (customer.phone || customer.email) fail('the demo customer has contact details');

  console.log('[seed-demo] records present: technician, customer, vehicle, job card, draft invoice, repair order');
}

async function repair(client: SupabaseClient, shopId: string) {
  await confirmSyntheticShop(client, shopId);
  await ensureRecords(client, shopId);
}

async function main() {
  const client = db();
  await preflight(client);
  const shopId = process.env.MARKETING_DEMO_SHOP_ID;
  if (shopId) await repair(client, shopId);
  else await create(client);
}

if (require.main === module) {
  main().catch(err => fail(err instanceof Error ? err.message : String(err)));
}
