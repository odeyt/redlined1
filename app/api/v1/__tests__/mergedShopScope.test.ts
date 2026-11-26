/**
 * One shop: D1 Imports (closed, archived 2026-10-17) folded into D1 Imports -
 * Location 2, as the machine API sees it.
 *
 * Before this fix a Location 2 key read only [Location 2], so the history
 * kept under the archived shop (customer "Sackdq- Ford 2498", vehicle Ford
 * Explorer #2498) was invisible to the API although staff see it through the
 * mirror. These tests use those exact ids and names.
 *
 * The merge rule is lib/shops/mergedScope.ts (mirrored both ways AND
 * archived) plus "same organization", applied in lib/api/principal.ts.
 */
import { hashApiKey, resolvePrincipal } from '@/lib/api/principal';
import { clearMergedScopeCache } from '@/lib/shops/mergedScope';
import { createFakeDb } from './fakeDb';

const fake = createFakeDb();
jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: () => fake, getServerDb: async () => fake }));
jest.mock('@/lib/observability/alerts', () => ({ alertException: jest.fn() }));

const ORG = 'org-d1';
const L2 = '90b72748-bf01-4456-999f-f4ba48091606';      // D1 Imports - Location 2 (canonical, open)
const D1 = '38d55fae-741b-4bac-b520-f96eed65bf38';      // D1 Imports (archived, merged)
const SISTER = '11111111-0000-4000-8000-000000000003';  // another OPEN location, mirrored both ways
const ONE_WAY = '11111111-0000-4000-8000-000000000004'; // archived, mirrored from L2 only
const FOREIGN = '11111111-0000-4000-8000-000000000005'; // archived, mirrored both ways, OTHER org
const TENANT = '11111111-0000-4000-8000-000000000006';  // unrelated tenant

const CUSTOMER = 'C-1789703178771';                      // Sackdq- Ford 2498, kept under D1
const VEHICLE = '3cd5cbc6-f3f1-4c6f-a675-ba7e014ef05c';  // Ford Explorer #2498, kept under D1
const OTHER_CUSTOMER = 'C-1700000000001';
const OTHER_VEHICLE = '22222222-0000-4000-8000-000000000002';

const key = (c: string) => 'rl_live_' + c.repeat(48);
const KEYS = {
  l2Read: key('a'), l2Write: key('b'), sister: key('c'), tenant: key('d'), d1Archived: key('e'), orgWide: key('f'),
};

const READ = ['customers:read', 'vehicles:read', 'estimates:read', 'invoices:read'];
const WRITE = [...READ, 'estimates:write', 'invoices:write', 'pdf:read'];

function seed({ sisterOpen = true } = {}) {
  fake.reset();
  clearMergedScopeCache(fake);
  const t = fake.tables;
  t.shops = [
    { id: L2, name: 'D1 Imports - Location 2', organization_id: ORG, archived_at: null },
    { id: D1, name: 'D1 Imports', organization_id: ORG, archived_at: '2026-10-17T04:21:39Z' },
    { id: SISTER, name: 'Sister location', organization_id: ORG, archived_at: sisterOpen ? null : '2026-11-01T00:00:00Z' },
    { id: ONE_WAY, name: 'Closed, one-way mirror', organization_id: ORG, archived_at: '2026-01-01T00:00:00Z' },
    { id: FOREIGN, name: 'Other org, closed', organization_id: 'org-other', archived_at: '2026-01-01T00:00:00Z' },
    { id: TENANT, name: 'Unrelated tenant', organization_id: 'org-tenant', archived_at: null },
  ];
  t.shop_mirrors = [
    { shop_id: L2, mirror_shop_id: D1 }, { shop_id: D1, mirror_shop_id: L2 },
    { shop_id: L2, mirror_shop_id: SISTER }, { shop_id: SISTER, mirror_shop_id: L2 },
    { shop_id: L2, mirror_shop_id: ONE_WAY },
    { shop_id: L2, mirror_shop_id: FOREIGN }, { shop_id: FOREIGN, mirror_shop_id: L2 },
  ];
  t.api_keys = [
    { id: 'k-l2-read', name: 'Wally Bot', organization_id: ORG, shop_id: L2, scopes: READ, revoked_at: null, key_hash: hashApiKey(KEYS.l2Read) },
    { id: 'k-l2-write', name: 'RedlineD1 CRM', organization_id: ORG, shop_id: L2, scopes: WRITE, revoked_at: null, key_hash: hashApiKey(KEYS.l2Write) },
    { id: 'k-sister', name: 'Sister bot', organization_id: ORG, shop_id: SISTER, scopes: READ, revoked_at: null, key_hash: hashApiKey(KEYS.sister) },
    { id: 'k-tenant', name: 'Tenant bot', organization_id: 'org-tenant', shop_id: TENANT, scopes: READ, revoked_at: null, key_hash: hashApiKey(KEYS.tenant) },
    { id: 'k-d1', name: 'Old D1 key', organization_id: ORG, shop_id: D1, scopes: WRITE, revoked_at: null, key_hash: hashApiKey(KEYS.d1Archived) },
    { id: 'k-org', name: 'Org-wide', organization_id: ORG, shop_id: null, scopes: WRITE, revoked_at: null, key_hash: hashApiKey(KEYS.orgWide) },
  ];
  // As in production: on for Location 2 only, off globally.
  t.feature_flags = [
    { flag_key: 'api_v1_documents', scope: 'global', enabled: false },
    { flag_key: 'api_v1_documents', scope: 'shop', shop_id: L2, enabled: true },
    { flag_key: 'api_v1_documents', scope: 'shop', shop_id: SISTER, enabled: true },
    { flag_key: 'api_v1_documents', scope: 'shop', shop_id: TENANT, enabled: true },
  ];
  t.shop_settings = [{ shop_id: L2, company_name: 'D1 Imports', address: 'Vientiane', phone: '020', default_tax_rate: 0 }];
  t.customers = [
    { id: CUSTOMER, shop_id: D1, name: 'Sackdq- Ford 2498', type: 'Individual', phone: '020 5555 2498', email: '', tags: [], archived_at: null },
    { id: OTHER_CUSTOMER, shop_id: L2, name: 'Somchai', type: 'Individual', phone: '', email: '', tags: [], archived_at: null },
    { id: 'C-SISTER', shop_id: SISTER, name: 'Sister customer 2498', type: 'Individual', phone: '', email: '', tags: [], archived_at: null },
    { id: 'C-ONEWAY', shop_id: ONE_WAY, name: 'One-way customer 2498', type: 'Individual', phone: '', email: '', tags: [], archived_at: null },
    { id: 'C-FOREIGN', shop_id: FOREIGN, name: 'Foreign customer 2498', type: 'Individual', phone: '', email: '', tags: [], archived_at: null },
    { id: 'C-TENANT', shop_id: TENANT, name: 'Tenant customer 2498', type: 'Individual', phone: '', email: '', tags: [], archived_at: null },
  ];
  t.vehicles = [
    { id: VEHICLE, shop_id: D1, customer_id: CUSTOMER, label: 'Ford Explorer', make: 'Ford', model: 'Explorer', plate: '#2498', vin: '', year: '', status: 'Active' },
    { id: OTHER_VEHICLE, shop_id: D1, customer_id: OTHER_CUSTOMER, label: 'Toyota Vios', make: 'Toyota', model: 'Vios', plate: '#1111', vin: '', year: '', status: 'Active' },
    { id: '33333333-0000-4000-8000-000000000003', shop_id: SISTER, customer_id: 'C-SISTER', label: 'Sister truck', make: '', model: '', plate: '#2498', vin: '', year: '', status: 'Active' },
  ];
  t.estimates = [
    { id: '44444444-0000-4000-8000-000000000004', shop_id: D1, estimate_number: 'EST-0007', status: 'Approved', customer_id: CUSTOMER,
      customer_name: 'Sackdq- Ford 2498', vehicle: 'Ford Explorer', currency: 'THB', lines: [], created_at: '2026-09-01T00:00:00Z' },
  ];
  t.invoices = [];
  t.payments = [];
}

/* eslint-disable @typescript-eslint/no-require-imports */
const R = {
  me: () => require('../me/route'),
  customers: () => require('../customers/route'),
  customer: () => require('../customers/[id]/route'),
  vehicles: () => require('../vehicles/route'),
  vehicle: () => require('../vehicles/[id]/route'),
  estimates: () => require('../estimates/route'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

async function call(handler: (r: Request) => Promise<Response>, method: string, path: string, k: string, body?: unknown, idem?: string) {
  const headers: Record<string, string> = { authorization: 'Bearer ' + k };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (idem) headers['idempotency-key'] = idem;
  const res = await handler(new Request('https://redlined1.test/api/v1' + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  }));
  return { status: res.status, body: await res.json() };
}
const ids = (r: { body: { data: { id: string }[] } }) => r.body.data.map(x => x.id);

beforeEach(() => seed());

describe('the principal: who reads what', () => {
  it('a Location 2 key reads Location 2 plus the merged, archived D1 Imports; writes Location 2', async () => {
    const p = await resolvePrincipal(fake, 'Bearer ' + KEYS.l2Read);
    expect(p).toMatchObject({ ownShopIds: [L2], activeShopIds: [L2], mergedShopIds: [D1], writeShopId: L2 });
    expect(p.shopIds).toEqual([L2, D1]);
  });

  it('never folds in an open sister location, a one-way mirror, or another organization', async () => {
    const p = await resolvePrincipal(fake, 'Bearer ' + KEYS.l2Read);
    expect(p.shopIds).not.toEqual(expect.arrayContaining([SISTER]));
    expect(p.shopIds).not.toContain(ONE_WAY);
    expect(p.shopIds).not.toContain(FOREIGN);
    expect(p.shopIds).not.toContain(TENANT);
  });

  it('a sister location\'s key does not see D1 Imports (D1 is merged into Location 2, not into it)', async () => {
    const p = await resolvePrincipal(fake, 'Bearer ' + KEYS.sister);
    expect(p.shopIds).toEqual([SISTER]);
  });

  it('a key on the archived shop itself reads it but can never write into it', async () => {
    const p = await resolvePrincipal(fake, 'Bearer ' + KEYS.d1Archived);
    expect(p).toMatchObject({ ownShopIds: [D1], activeShopIds: [], writeShopId: null });
  });

  it('an organization-wide key cannot pick between two OPEN shops', async () => {
    const p = await resolvePrincipal(fake, 'Bearer ' + KEYS.orgWide);
    expect(p.writeShopId).toBeNull();
  });

  it('...but writes to the organization\'s only open shop once the sister closes', async () => {
    seed({ sisterOpen: false });
    const p = await resolvePrincipal(fake, 'Bearer ' + KEYS.orgWide);
    expect(p.writeShopId).toBe(L2);
  });

  it('fails closed: a mirror lookup error leaves the key on its own shop', async () => {
    const broken = {
      ...fake,
      from: (t: string) => t === 'shop_mirrors'
        ? { select: () => ({ eq: () => Promise.resolve({ data: null, error: { message: 'down' } }) }) }
        : fake.from(t),
    };
    const p = await resolvePrincipal(broken, 'Bearer ' + KEYS.l2Read);
    expect(p.shopIds).toEqual([L2]);
  });
});

describe('Grok\'s Location 2 key finds the D1 Imports records', () => {
  it('/me shows Location 2, the merged D1 Imports, and writes to Location 2 (flag on for L2 only)', async () => {
    const r = await call(R.me().GET, 'GET', '/me', KEYS.l2Read);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      shops: [{ id: L2, name: 'D1 Imports - Location 2' }],
      merged_shops: [{ id: D1, name: 'D1 Imports' }],
      write_shop_id: L2,
    });
  });

  it('customer search finds "Sackdq- Ford 2498" by name and by number', async () => {
    expect(ids(await call(R.customers().GET, 'GET', '/customers?search=Sackdq', KEYS.l2Read))).toEqual([CUSTOMER]);
    expect(ids(await call(R.customers().GET, 'GET', '/customers?search=ford%202498', KEYS.l2Read))).toEqual([CUSTOMER]);
    expect(ids(await call(R.customers().GET, 'GET', '/customers?search=5555%202498', KEYS.l2Read))).toEqual([CUSTOMER]);
  });

  it('the customer is retrievable by its existing id', async () => {
    const r = await call(R.customer().GET, 'GET', `/customers/${CUSTOMER}`, KEYS.l2Read);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ id: CUSTOMER, name: 'Sackdq- Ford 2498' });
  });

  it('vehicle search finds the Ford Explorer by plate #2498, and it is retrievable by id', async () => {
    expect(ids(await call(R.vehicles().GET, 'GET', '/vehicles?search=%232498', KEYS.l2Read))).toEqual([VEHICLE]);
    const r = await call(R.vehicle().GET, 'GET', `/vehicles/${VEHICLE}`, KEYS.l2Read);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ id: VEHICLE, plate: '#2498', customer_id: CUSTOMER });
  });

  it('D1 Imports\' estimate history is listed for the customer', async () => {
    const r = await call(R.estimates().GET, 'GET', `/estimates?customer_id=${CUSTOMER}`, KEYS.l2Read);
    expect(r.body.data.map((e: { number: string }) => e.number)).toEqual(['EST-0007']);
  });
});

describe('a draft for those records, saved under Location 2', () => {
  const body = { customer_id: CUSTOMER, vehicle_id: VEHICLE, lines: [{ description: 'Diagnosis', qty: 1, rate: 500 }] };

  it('the draft-write key creates a Location 2 draft against the existing D1 customer and vehicle', async () => {
    const before = JSON.stringify([fake.tables.customers, fake.tables.vehicles]);
    const r = await call(R.estimates().POST, 'POST', '/estimates', KEYS.l2Write, body, 'merge-1');
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ status: 'draft', customer_id: CUSTOMER, customer_name: 'Sackdq- Ford 2498', vehicle: 'Ford Explorer' });

    const row = fake.tables.estimates.find(e => e.id === r.body.data.id)!;
    expect(row).toMatchObject({ shop_id: L2, customer_id: CUSTOMER, created_via: 'api' });
    // Location 2's numbering, not D1 Imports'.
    const numbering = fake.calls.rpc.find(c => c.fn === 'api_next_document_number')!;
    expect(numbering.args).toMatchObject({ p_shop_id: L2, p_doc_type: 'estimate' });
    // Nothing historical moved or changed.
    expect(JSON.stringify([fake.tables.customers, fake.tables.vehicles])).toBe(before);
    expect(fake.tables.estimates.find(e => e.estimate_number === 'EST-0007')).toMatchObject({ shop_id: D1 });
  });

  it('refuses a vehicle that belongs to a different customer', async () => {
    const r = await call(R.estimates().POST, 'POST', '/estimates', KEYS.l2Write, { ...body, vehicle_id: OTHER_VEHICLE }, 'merge-2');
    expect(r.status).toBe(422);
    expect(r.body.error.details.reason).toMatch(/different customer/);
  });

  it('a read-only key cannot write', async () => {
    const r = await call(R.estimates().POST, 'POST', '/estimates', KEYS.l2Read, body, 'merge-3');
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('SCOPE_REQUIRED');
  });

  it('a key on the archived D1 shop cannot reach the draft endpoints (no open shop, no flag)', async () => {
    const r = await call(R.estimates().POST, 'POST', '/estimates', KEYS.d1Archived, body, 'merge-4');
    expect(r.status).toBe(404);
    expect(fake.tables.estimates.filter(e => e.created_via === 'api')).toHaveLength(0);
  });
});

describe('everyone else stays outside the merged scope', () => {
  it('an open sister location cannot see the D1 records', async () => {
    expect((await call(R.customer().GET, 'GET', `/customers/${CUSTOMER}`, KEYS.sister)).status).toBe(404);
    expect((await call(R.vehicle().GET, 'GET', `/vehicles/${VEHICLE}`, KEYS.sister)).status).toBe(404);
    expect(ids(await call(R.vehicles().GET, 'GET', '/vehicles?search=2498', KEYS.sister))).not.toContain(VEHICLE);
  });

  it('an unrelated tenant cannot see them', async () => {
    expect((await call(R.customer().GET, 'GET', `/customers/${CUSTOMER}`, KEYS.tenant)).status).toBe(404);
    expect(ids(await call(R.customers().GET, 'GET', '/customers?search=2498', KEYS.tenant))).toEqual(['C-TENANT']);
  });

  it('Location 2\'s key does not see the sister, one-way, foreign or tenant customers', async () => {
    expect(ids(await call(R.customers().GET, 'GET', '/customers?search=2498', KEYS.l2Read))).toEqual([CUSTOMER]);
  });

  it('with the flag off globally and no Location 2 row, the document endpoints are 404 again', async () => {
    fake.tables.feature_flags = fake.tables.feature_flags.filter(f => f.shop_id !== L2);
    expect((await call(R.me().GET, 'GET', '/me', KEYS.l2Read)).status).toBe(404);
  });
});
