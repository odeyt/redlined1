/**
 * The portal across the D1 merge.
 *
 * D1 Imports (archived) was merged into Location 2 (active) with a two-way
 * mirror. A returning D1 customer's record stayed in D1, but their new
 * invoices, estimates and vehicles are created in Location 2 — and their portal
 * link showed none of them. These tests run the real loader against production
 * column names (plus shop_mirrors, whose columns lib/shops/mergedScope.ts reads
 * on production since PR #92).
 */
import { pickPortalShops, portalShopScope } from '../portalScope';
import { loadPortal } from '../loadPortal';
import { applyEstimateAction, type EstimateActionStore, type PortalEstimateRecord } from '../estimateAction';
import { schemaFaithfulClient } from './fixtures/schemaFaithfulClient';
import { PRODUCTION_COLUMNS } from './fixtures/productionSchema';

const D1 = '38d55fae-0000-4000-8000-00000000000a';   // closed, archived
const L2 = '90b72748-0000-4000-8000-00000000000b';   // active, D1 merged into it
const LIVE_B = 'cccccccc-0000-4000-8000-00000000000c'; // a live second location mirrored with L2
const OTHER = 'eeeeeeee-0000-4000-8000-00000000000e';  // another tenant
const TOK_D1 = 'd1'.repeat(32);
const TOK_L2 = 'e2'.repeat(32);
const noSign = async () => new Map<string, string>();

const COLUMNS = { ...PRODUCTION_COLUMNS, shop_mirrors: ['shop_id', 'mirror_shop_id'] as const };

function fixtures(over: Partial<Record<string, Record<string, unknown>[]>> = {}) {
  return {
    customer_portal_tokens: [{ customer_id: 'C-D1', token: TOK_D1 }, { customer_id: 'C-L2', token: TOK_L2 }],
    customers: [
      { id: 'C-D1', name: 'ZZ TEST Returning D1', shop_id: D1 },
      { id: 'C-L2', name: 'ZZ TEST New L2', shop_id: L2 },
    ],
    shops: [
      { id: D1, name: 'D1 Imports', archived_at: '2026-10-17T04:21:39Z' },
      { id: L2, name: 'D1 Imports — Location 2', archived_at: null },
      { id: LIVE_B, name: 'Live Branch', archived_at: null },
      { id: OTHER, name: 'Other Tenant', archived_at: null },
    ],
    shop_mirrors: [
      { shop_id: D1, mirror_shop_id: L2 }, { shop_id: L2, mirror_shop_id: D1 },
      { shop_id: L2, mirror_shop_id: LIVE_B }, { shop_id: LIVE_B, mirror_shop_id: L2 },
    ],
    shop_settings: [{ shop_id: D1, company_name: 'D1 Imports', tagline: '', phone: '', email: '', address: '', logo_url: null }],
    vehicles: [
      { id: 'V-OLD', customer_id: 'C-D1', shop_id: D1, label: 'Old Hilux', year: '2015', make: 'Toyota', model: 'Hilux', plate: 'OLD-1', mileage: 1, status: 'Active', vin: 'SYNTHVIN1' },
      { id: 'V-NEW', customer_id: 'C-D1', shop_id: L2, label: 'New Ranger', year: '2021', make: 'Ford', model: 'Ranger', plate: 'NEW-1', mileage: 2, status: 'Active', vin: 'SYNTHVIN2' },
      { id: 'V-FOREIGN', customer_id: 'C-D1', shop_id: OTHER, label: 'Foreign', year: '2010', make: 'x', model: 'x', plate: 'X', mileage: 3, status: 'Active', vin: 'SYNTHVIN3' },
      { id: 'V-LIVEB', customer_id: 'C-L2', shop_id: LIVE_B, label: 'Branch car', year: '2012', make: 'x', model: 'x', plate: 'B', mileage: 4, status: 'Active', vin: 'SYNTHVIN4' },
    ],
    invoices: [
      { number: 'INV-OLD', customer_id: 'C-D1', shop_id: D1, status: 'Paid', currency: 'USD', lines: [{ qty: 1, rate: 50 }], discount: 0, shop_supplies: 0, tax_rate: 0, created_at: '2026-09-01T00:00:00Z' },
      { number: 'INV-NEW', customer_id: 'C-D1', shop_id: L2, status: 'Sent', currency: 'USD', lines: [{ qty: 2, rate: 50 }], discount: 0, shop_supplies: 0, tax_rate: 0, created_at: '2026-10-18T00:00:00Z' },
      { number: 'INV-FOREIGN', customer_id: 'C-D1', shop_id: OTHER, status: 'Sent', currency: 'USD', lines: [{ qty: 1, rate: 999 }], discount: 0, shop_supplies: 0, tax_rate: 0, created_at: '2026-10-18T00:00:00Z' },
      { number: 'INV-LIVEB', customer_id: 'C-L2', shop_id: LIVE_B, status: 'Sent', currency: 'USD', lines: [{ qty: 1, rate: 7 }], discount: 0, shop_supplies: 0, tax_rate: 0, created_at: '2026-10-18T00:00:00Z' },
    ],
    estimates: [
      { id: 'E-NEW', estimate_number: 'EST-NEW', customer_id: 'C-D1', shop_id: L2, status: 'Sent', currency: 'USD', lines: [{ qty: 1, rate: 80 }], discount: 0, tax_rate: 0, created_at: '2026-10-18T00:00:00Z' },
    ],
    inspections: [],
    repair_orders: [
      { id: 'RO-NEW', ro_number: 'RO-00090', customer_id: 'C-D1', shop_id: L2, status: 'Open', opened_date: '2026-10-18', currency: 'USD', parts: [], work_lines: [] },
    ],
    payments: [
      { id: 'P-NEW', invoice_number: 'INV-NEW', shop_id: L2, amount: 40, currency: 'USD', status: 'completed', entry_type: 'payment', payment_date: '2026-10-18' },
      { id: 'P-FOREIGN', invoice_number: 'INV-NEW', shop_id: OTHER, amount: 60, currency: 'USD', status: 'completed', entry_type: 'payment', payment_date: '2026-10-18' },
    ],
    ...over,
  };
}

describe('pickPortalShops', () => {
  const archived = [D1];
  it('a closed shop reaches the live shop it was merged into', () => {
    expect(pickPortalShops(D1, [L2], [L2], archived)).toEqual([D1, L2]);
  });
  it('the live shop reaches the closed shop merged into it, never a live peer', () => {
    expect(pickPortalShops(L2, [D1, LIVE_B], [D1, LIVE_B], archived)).toEqual([L2, D1]);
  });
  it('two live locations stay separate', () => {
    expect(pickPortalShops(LIVE_B, [L2], [L2], archived)).toEqual([LIVE_B]);
  });
  it('a one-way mirror does not widen', () => {
    expect(pickPortalShops(D1, [L2], [], archived)).toEqual([D1]);
  });
  it('two archived shops do not widen each other', () => {
    expect(pickPortalShops(D1, [L2], [L2], [D1, L2])).toEqual([D1]);
  });
  it('empty id → empty scope', () => {
    expect(pickPortalShops('', [L2], [L2], archived)).toEqual([]);
  });
});

describe('portalShopScope', () => {
  it('reads mirrors and archive state', async () => {
    const db = schemaFaithfulClient(fixtures(), COLUMNS);
    expect(await portalShopScope(db.client, D1)).toEqual([D1, L2]);
    expect(await portalShopScope(db.client, L2)).toEqual([L2, D1]);
    expect(await portalShopScope(db.client, OTHER)).toEqual([OTHER]);
  });

  it('fails closed to the customer\'s own shop', async () => {
    for (const table of ['shop_mirrors', 'shops']) {
      const db = schemaFaithfulClient(fixtures(), COLUMNS);
      db.failNext(table, '57014');
      expect([table, await portalShopScope(db.client, D1)]).toEqual([table, [D1]]);
    }
    // A database without shop_mirrors at all (as in the older portal tests).
    expect(await portalShopScope(schemaFaithfulClient(fixtures()).client, D1)).toEqual([D1]);
  });
});

describe('loadPortal across the merge', () => {
  it('a returning D1 customer sees their new Location 2 invoice, estimate, repair order, vehicle and payment', async () => {
    const data = await loadPortal(schemaFaithfulClient(fixtures(), COLUMNS).client, TOK_D1, noSign);
    expect(data).not.toBeNull();
    expect(data!.invoices.map(i => i.invoiceNumber).sort()).toEqual(['INV-NEW', 'INV-OLD']);
    expect(data!.invoices.find(i => i.invoiceNumber === 'INV-NEW')).toMatchObject({ total: 100, amountPaid: 40, balance: 60 });
    expect(data!.estimates.map(e => e.estimateNumber)).toEqual(['EST-NEW']);
    expect(data!.repairOrders).toHaveLength(1);
    expect(data!.vehicles.map(v => v.id).sort()).toEqual(['V-NEW', 'V-OLD']);
  });

  it('never shows another tenant\'s rows carrying the same customer id, nor a VIN', async () => {
    const text = JSON.stringify(await loadPortal(schemaFaithfulClient(fixtures(), COLUMNS).client, TOK_D1, noSign));
    for (const foreign of ['INV-FOREIGN', 'V-FOREIGN', 'P-FOREIGN', 'SYNTHVIN']) expect([foreign, text.includes(foreign)]).toEqual([foreign, false]);
  });

  it('a Location 2 customer does not see the live second location', async () => {
    const text = JSON.stringify(await loadPortal(schemaFaithfulClient(fixtures(), COLUMNS).client, TOK_L2, noSign));
    expect(text).not.toContain('INV-LIVEB');
    expect(text).not.toContain('V-LIVEB');
  });

  it('keeps the customer row and branding on the customer\'s own shop', async () => {
    const db = schemaFaithfulClient(fixtures(), COLUMNS);
    const data = await loadPortal(db.client, TOK_D1, noSign);
    expect(data!.customer.name).toBe('ZZ TEST Returning D1');
    expect(data!.shop.name).toBe('D1 Imports');
  });

  it('if the scope lookup fails, shows exactly the pre-merge view (own shop only)', async () => {
    const db = schemaFaithfulClient(fixtures(), COLUMNS);
    db.failNext('shop_mirrors', '57014');
    const data = await loadPortal(db.client, TOK_D1, noSign);
    expect(data!.invoices.map(i => i.invoiceNumber)).toEqual(['INV-OLD']);
  });
});

describe('estimate action across the merge', () => {
  const EST = '11111111-1111-4111-8111-111111111111';
  const EST_FOREIGN = '44444444-4444-4444-8444-444444444444';

  function store() {
    const estimates: Record<string, PortalEstimateRecord & Record<string, unknown>> = {
      [EST]: { id: EST, shopId: L2, customerId: 'C-D1', status: 'Sent', estimateNumber: 'EST-NEW' },
      [EST_FOREIGN]: { id: EST_FOREIGN, shopId: OTHER, customerId: 'C-D1', status: 'Sent', estimateNumber: 'EST-X' },
    };
    const updates: Array<{ shopId: string }> = [];
    const s: EstimateActionStore = {
      async findCustomerByToken(t) { return t === TOK_D1 ? { id: 'C-D1', shopId: D1 } : null; },
      async findScope(c) { return c.shopId === D1 ? [D1, L2] : [c.shopId]; },
      async findEstimate(id) { return estimates[id] ? { ...estimates[id] } : null; },
      async updateIfStatus(scope, from, patch) {
        const e = estimates[scope.id];
        updates.push({ shopId: scope.shopId });
        if (!e || e.customerId !== scope.customerId || e.shopId !== scope.shopId || !from.includes(e.status)) return 0;
        Object.assign(e, patch);
        return 1;
      },
      async audit() {},
    };
    return { s, estimates, updates };
  }

  it('a D1 customer can approve their Location 2 estimate, exactly once', async () => {
    const { s, estimates, updates } = store();
    expect(await applyEstimateAction(s, { token: TOK_D1, estimateId: EST, action: 'approve' })).toMatchObject({ status: 200 });
    expect(estimates[EST].status).toBe('Approved');
    expect(updates).toEqual([{ shopId: L2 }]); // the write is scoped to the estimate's own shop
    expect(await applyEstimateAction(s, { token: TOK_D1, estimateId: EST, action: 'decline' })).toMatchObject({ status: 409 });
  });

  it('an estimate outside the scope is still not found', async () => {
    const { s, estimates } = store();
    expect(await applyEstimateAction(s, { token: TOK_D1, estimateId: EST_FOREIGN, action: 'approve' })).toMatchObject({ status: 404 });
    expect(estimates[EST_FOREIGN].status).toBe('Sent');
  });

  it('without findScope, only the customer\'s own shop (pre-merge behaviour)', async () => {
    const { s } = store();
    delete (s as Partial<EstimateActionStore>).findScope;
    expect(await applyEstimateAction(s, { token: TOK_D1, estimateId: EST, action: 'approve' })).toMatchObject({ status: 404 });
  });
});
