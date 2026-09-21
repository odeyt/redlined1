/**
 * computeActivation against an in-memory database. Synthetic ids only.
 */
import { computeActivation, isChosenBusinessName, type ActivationInput } from '../activationData';
import { createFakeAdminDb, type Row } from './fakeAdminDb';

const DAY = 86400000;
const NOW = Date.now();
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();

const fake = createFakeAdminDb();
const S = (n: number) => `f${String(n).padStart(7, '0')}-0000-4000-8000-000000000000`;
const U = (n: number) => `g${String(n).padStart(7, '0')}-0000-4000-8000-000000000000`;

const input = (n: number, o: Partial<ActivationInput> = {}): ActivationInput => ({
  shopId: S(n), ownerUserId: U(n), entitlement: 'free', paidVerified: false, createdAt: ago(2), ...o,
});
const rows = (shop: number, count = 1, extra: Row = {}): Row[] => Array.from({ length: count }, () => ({ shop_id: S(shop), ...extra }));

function reset() {
  fake.state.failTables.clear();
  fake.state.missingColumns = {};
  fake.state.failAuth = false;
  fake.state.selects.length = 0;
  fake.state.authUsers = {
    [U(1)]: { created_at: ago(30), last_sign_in_at: ago(1) },   // returned
    [U(2)]: { created_at: ago(5), last_sign_in_at: ago(5) },    // same-day only
    [U(3)]: { created_at: ago(20), last_sign_in_at: ago(2) },
    [U(4)]: { created_at: ago(9), last_sign_in_at: null },
    [U(5)]: { created_at: ago(40), last_sign_in_at: ago(3) },
  };
  fake.state.tables = {
    // 1: activated (customer + vehicle + estimate)     2: signed up only
    // 3: onboarding started                            4: operational data (customer only)
    // 5: activated and paid
    customers: [...rows(1), ...rows(4), ...rows(5, 9)],
    vehicles: [...rows(1), ...rows(5, 2)],
    job_cards: [...rows(5, 4, { check_in_date: ago(1) }), ...rows(5, 3, { check_in_date: ago(70) })],
    repair_orders: [],
    estimates: [...rows(1), ...rows(5)],
    invoices: [], technicians: [],
    shop_settings: [
      { shop_id: S(1), company_name: 'Filled In' }, { shop_id: S(2), company_name: '' }, { shop_id: S(3), company_name: 'Named' },
      { shop_id: S(4), company_name: '   ' }, { shop_id: S(5), company_name: 'Paid Co' },
    ],
  };
}

beforeEach(reset);

const inputs = [input(1), input(2), input(3), input(4), input(5, { paidVerified: true, entitlement: 'pro' })];

describe('computeActivation', () => {
  it('stages every shop into exactly one stage', async () => {
    const { summary, byShop } = await computeActivation(fake.db as never, inputs, NOW);
    expect(byShop[S(1)].stage).toBe('activated');
    expect(byShop[S(2)].stage).toBe('signed_up_only');
    expect(byShop[S(3)].stage).toBe('onboarding_started');
    expect(byShop[S(4)].stage).toBe('operational_data');
    expect(byShop[S(5)].stage).toBe('paid');
    expect(Object.values(summary.stages).reduce((a, b) => a + b, 0)).toBe(summary.genuineShops);
  });

  it('applies the definition: customer + vehicle + estimate is activated; a customer alone is not', async () => {
    const { summary } = await computeActivation(fake.db as never, inputs, NOW);
    expect(summary.activatedShops).toBe(2); // shops 1 and 5
    expect(summary.signedUpNotActivated).toBe(3);
    expect(summary.activationRatePercent).toBe(40);
    expect(summary.activatedNotPaid).toBe(1);
  });

  it('computes paid conversion from verified paid shops only', async () => {
    const { summary } = await computeActivation(fake.db as never, inputs, NOW);
    expect(summary.paidShops).toBe(1);
    expect(summary.paidConversionPercent).toBe(20);
  });

  it('counts partial onboarding and new shops that still need onboarding', async () => {
    const { summary } = await computeActivation(fake.db as never, inputs, NOW);
    expect(summary.partialOnboarding).toBe(2); // shops 3 and 4
    expect(summary.newShopsNeedingOnboarding).toBe(1); // shop 2, created 2 days ago
    const old = await computeActivation(fake.db as never, [input(2, { createdAt: ago(60) })], NOW);
    expect(old.summary.newShopsNeedingOnboarding).toBe(0);
  });

  it('a whitespace-only business name is not onboarding', async () => {
    const { byShop } = await computeActivation(fake.db as never, [input(4)], NOW);
    expect(byShop[S(4)].stage).toBe('operational_data'); // from the customer, not the blank name
  });

  it('finds shops approaching a Free Forever limit, only for free entitlement', async () => {
    const { byShop } = await computeActivation(fake.db as never, [input(5), input(5, { shopId: S(5), entitlement: 'pro' })], NOW);
    expect(byShop[S(5)].approachingFreeLimit).toBe(false); // last write (pro) wins for the same shop id
    const free = await computeActivation(fake.db as never, [input(5)], NOW);
    expect(free.byShop[S(5)].approachingFreeLimit).toBe(true); // 9 customers of 10, 4 jobs this month of 5
    expect(free.summary.approachingFreeLimit).toBe(1);
  });

  it('counts only this month\'s jobs toward the monthly limit', async () => {
    fake.state.tables.customers = []; fake.state.tables.vehicles = [];
    fake.state.tables.job_cards = rows(5, 2, { check_in_date: ago(1) }).concat(rows(5, 20, { check_in_date: ago(70) }));
    const { byShop } = await computeActivation(fake.db as never, [input(5)], NOW);
    expect(byShop[S(5)].approachingFreeLimit).toBe(false);
  });

  it('reports who returned after the first session, and how many were knowable', async () => {
    const { summary, byShop } = await computeActivation(fake.db as never, inputs, NOW);
    expect(byShop[S(1)].returned).toBe(true);
    expect(byShop[S(2)].returned).toBe(false);
    expect(byShop[S(4)].returned).toBe(false); // never signed in
    expect(summary.returnedKnown).toBe(5);
    expect(summary.returnedAfterFirstSession).toBe(3);
  });

  it('an unreadable table makes its milestones unknown, not "no"', async () => {
    fake.state.failTables.add('customers');
    const { summary, byShop } = await computeActivation(fake.db as never, inputs, NOW);
    expect(summary.unavailableSources).toContain('customers');
    expect(byShop[S(2)].stage).toBe('unknown'); // nothing else present, and customers could not be read
    expect(byShop[S(1)].activated).toBeNull();  // customer unknown, so the definition cannot be decided
    expect(byShop[S(4)].stage).not.toBe('signed_up_only');
    expect(summary.activationUnknown).toBeGreaterThan(0);
  });

  it('a failed auth lookup leaves "returned" unknown instead of false', async () => {
    fake.state.failAuth = true;
    const { summary, byShop } = await computeActivation(fake.db as never, inputs, NOW);
    expect(byShop[S(1)].returned).toBeNull();
    expect(summary.returnedKnown).toBe(0);
  });

  it('never throws: an unexpected failure returns an unavailable summary, not an error', async () => {
    const broken = { from: () => { throw new Error('boom'); }, auth: fake.db.auth };
    const { summary } = await computeActivation(broken as never, inputs, NOW);
    expect(summary.available).toBe(false);
    expect(summary.genuineShops).toBe(0);
    expect(summary.reason).toMatch(/could not be computed/);
  });

  it('with no shops it is available and empty, with no division by zero', async () => {
    const { summary } = await computeActivation(fake.db as never, [], NOW);
    expect(summary.available).toBe(true);
    expect(summary.activationRatePercent).toBeNull();
    expect(summary.paidConversionPercent).toBeNull();
  });

  it('lists the milestones no existing record can answer', async () => {
    const { summary } = await computeActivation(fake.db as never, inputs, NOW);
    expect(summary.notDerivable).toEqual(['first customer communication', 'upgrade page viewed', 'checkout started']);
  });

  it('reads only shop_id (and the two columns it needs) — no record contents', async () => {
    await computeActivation(fake.db as never, inputs, NOW);
    const cols = new Set(fake.state.selects.flatMap(s => s.columns));
    expect([...cols].sort()).toEqual(['check_in_date', 'company_name', 'shop_id']);
  });

  it('is read-only: no write methods exist on the query surface', () => {
    const q = fake.db.from('customers');
    for (const m of ['insert', 'update', 'upsert', 'delete', 'rpc']) expect(q).not.toHaveProperty(m);
  });

  it('does not leak identifiers into the summary', async () => {
    const { summary } = await computeActivation(fake.db as never, inputs, NOW);
    expect(JSON.stringify(summary)).not.toMatch(/f0000|g0000/);
  });
});

describe('a page that may have been cut short by the server', () => {
  // PostgREST silently applies its own max-rows (1000 by default). A full page therefore
  // proves nothing about shops that have no rows in it. Shop 5 stands in for a large shop
  // in the same request.
  const fill = () => Array.from({ length: 1000 }, () => ({ shop_id: S(5) }));

  it('reads "no customers" as unknown, not as none, when the customers page came back full', async () => {
    // Shop 6 has a vehicle and an estimate but no customer row in the (full) page.
    fake.state.tables.customers = [...rows(1), ...fill()];
    fake.state.tables.vehicles = [...rows(1), ...rows(6), ...rows(5, 2)];
    fake.state.tables.estimates = [...rows(1), ...rows(6), ...rows(5)];
    const { byShop, summary } = await computeActivation(fake.db as never, [input(1), input(6), input(5)], NOW);
    expect(byShop[S(1)].activated).toBe(true);   // a row was seen: that is proof
    expect(byShop[S(6)].activated).toBeNull();   // no customer row in a page that may be cut short: unknown, not false
    expect(byShop[S(6)].stage).toBe('operational_data'); // known rows still count; it just cannot be called activated or not
    expect(summary.activationUnknown).toBe(1);
    expect(summary.signedUpNotActivated).toBe(0);
  });

  it('does not report approaching-limit from an under-counted read', async () => {
    fake.state.tables.customers = [...rows(1, 9), ...fill()];
    const { byShop } = await computeActivation(fake.db as never, [input(1), input(5)], NOW);
    expect(byShop[S(1)].approachingFreeLimit).toBe(false);
  });

  it('a normal-sized read reports approaching-limit and a shop with no rows as genuinely none', async () => {
    fake.state.tables.customers = [...rows(1, 9)];
    const { byShop } = await computeActivation(fake.db as never, [input(1), input(2)], NOW);
    expect(byShop[S(1)].approachingFreeLimit).toBe(true);
    expect(byShop[S(2)].stage).toBe('signed_up_only');
    expect(byShop[S(2)].activated).toBe(false);
  });
});

describe('business name as an onboarding signal', () => {
  it('blank, whitespace and the product default all mean "no business name yet"', () => {
    for (const v of ['', '   ', null, undefined, 'Redline', ' redline ', 'REDLINE']) expect(isChosenBusinessName(v)).toBe(false);
  });

  it('a name the shop typed counts, including one that merely contains the product name', () => {
    for (const v of ['Somchai Auto', 'Redline Garage Vientiane']) expect(isChosenBusinessName(v)).toBe(true);
  });

  it('a legacy row still holding the default does not put a shop into "onboarding started"', async () => {
    fake.state.tables.shop_settings = [{ shop_id: S(2), company_name: 'Redline' }];
    const { byShop } = await computeActivation(fake.db as never, [input(2)], NOW);
    expect(byShop[S(2)].stage).toBe('signed_up_only');
  });
});
