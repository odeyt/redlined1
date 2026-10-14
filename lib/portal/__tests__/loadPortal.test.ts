/**
 * The portal loader, run for real against production's column set.
 *
 * Reported 2026-10-14: a valid staff-copied portal link showed "Portal Not
 * Found". The vehicles query selected license_plate and color; production has
 * `plate` and no colour column, so PostgREST answered 42703 and the loader
 * failed closed. Mapper-only tests could not see it — these run the query.
 */
import { loadPortal, PORTAL_VEHICLE_COLUMNS } from '../loadPortal';
import { schemaFaithfulClient } from './fixtures/schemaFaithfulClient';
import { PRODUCTION_COLUMNS } from './fixtures/productionSchema';

const SHOP = '38d55fae-0000-4000-8000-00000000000a';
const OTHER_SHOP = '90b72748-0000-4000-8000-00000000000b';
const TOK_A = 'a1'.repeat(32);
const TOK_B = 'b2'.repeat(32);
const noSign = async () => new Map<string, string>();

function fixtures() {
  return {
    customer_portal_tokens: [
      { customer_id: 'C-A', token: TOK_A },
      { customer_id: 'C-B', token: TOK_B },
    ],
    customers: [
      { id: 'C-A', name: 'ZZ TEST Portal A', shop_id: SHOP },
      { id: 'C-B', name: 'ZZ TEST Portal B', shop_id: SHOP },
    ],
    shops: [{ id: SHOP, name: 'Synthetic Shop' }],
    shop_settings: [{ shop_id: SHOP, company_name: 'Synthetic Motors', tagline: '', phone: '', email: '', address: '', logo_url: null }],
    // Shaped like production: `plate`, no colour column, and a VIN that must never be fetched.
    vehicles: [
      { id: 'V-A', customer_id: 'C-A', shop_id: SHOP, year: '2020', make: 'Toyota', model: 'Corolla', plate: 'QA-A-1014', mileage: 12000, status: 'Active', vin: 'SYNTHETICVIN00001' },
      { id: 'V-B', customer_id: 'C-B', shop_id: SHOP, year: '2019', make: 'Honda', model: 'Civic', plate: 'QA-B-1014', mileage: 5000, status: 'Active', vin: 'SYNTHETICVIN00002' },
      { id: 'V-X', customer_id: 'C-A', shop_id: OTHER_SHOP, year: '2018', make: 'Ford', model: 'Ranger', plate: 'QA-X', mileage: 1, status: 'Active', vin: 'SYNTHETICVIN00003' },
    ],
    invoices: [
      { number: 'INV-A', customer_id: 'C-A', shop_id: SHOP, status: 'Sent', currency: 'USD', lines: [{ description: 'Service', qty: 1, rate: 100 }], discount: 0, shop_supplies: 0, tax_rate: 0.0635, created_at: '2026-10-14T00:00:00Z' },
      { number: 'INV-X', customer_id: 'C-A', shop_id: OTHER_SHOP, status: 'Sent', currency: 'USD', lines: [{ qty: 1, rate: 999 }], discount: 0, shop_supplies: 0, tax_rate: 0, created_at: '2026-10-14T00:00:00Z' },
    ],
    estimates: [
      { id: 'E-A', estimate_number: 'EST-A', customer_id: 'C-A', shop_id: SHOP, status: 'Sent', currency: 'USD', lines: [{ description: 'Pads', qty: 1, rate: 50 }], discount: 0, tax_rate: 0, created_at: '2026-10-14T00:00:00Z' },
      { id: 'E-B', estimate_number: 'EST-B', customer_id: 'C-B', shop_id: SHOP, status: 'Sent', currency: 'USD', lines: [{ qty: 1, rate: 70 }], discount: 0, tax_rate: 0, created_at: '2026-10-14T00:00:00Z' },
    ],
    inspections: [],
    repair_orders: [],
    payments: [],
  };
}

describe('loadPortal against production columns', () => {
  it('loads a valid link: vehicle with its plate, exact invoice total, own estimate', async () => {
    const db = schemaFaithfulClient(fixtures());
    const data = await loadPortal(db.client, TOK_A, noSign);
    expect(data).not.toBeNull();
    expect(data!.customer).toEqual({ name: 'ZZ TEST Portal A' });
    expect(data!.shop.name).toBe('Synthetic Motors');
    expect(data!.vehicles).toEqual([
      { id: 'V-A', year: '2020', make: 'Toyota', model: 'Corolla', licensePlate: 'QA-A-1014', color: '', mileage: 12000, status: 'Active' },
    ]);
    expect(data!.invoices).toHaveLength(1);
    expect(data!.invoices[0]).toMatchObject({ invoiceNumber: 'INV-A', currency: 'USD', total: 106.35, tax: 6.35, balance: 106.35 });
    expect(data!.estimates.map(e => e.estimateNumber)).toEqual(['EST-A']);
  });

  it('shows only this customer in this shop: not B, not A’s id under another shop', async () => {
    const data = await loadPortal(schemaFaithfulClient(fixtures()).client, TOK_A, noSign);
    const text = JSON.stringify(data);
    for (const foreign of ['C-B', 'V-B', 'QA-B-1014', 'EST-B', 'E-B', 'V-X', 'INV-X', 'QA-X']) {
      expect([foreign, text.includes(foreign)]).toEqual([foreign, false]);
    }
  });

  it('never fetches or returns a VIN', async () => {
    const db = schemaFaithfulClient(fixtures());
    const data = await loadPortal(db.client, TOK_A, noSign);
    expect(db.queries.find(q => q.startsWith('vehicles:'))).not.toMatch(/\bvin\b|\*/);
    expect(JSON.stringify(data)).not.toContain('SYNTHETICVIN');
  });

  it('every column the vehicle query names exists in production', () => {
    for (const col of PORTAL_VEHICLE_COLUMNS.split(',').map(c => c.trim())) {
      expect([col, PRODUCTION_COLUMNS.vehicles.includes(col)]).toEqual([col, true]);
    }
  });

  it('the double rejects #85’s vehicle columns exactly as production did (42703)', async () => {
    const db = schemaFaithfulClient(fixtures());
    const res = await db.client.from('vehicles').select('id, year, make, model, license_plate, color, mileage, status').eq('customer_id', 'C-A');
    expect(res.error).toMatchObject({ code: '42703' });
  });

  it('returns null for unknown and malformed tokens; a malformed one never queries', async () => {
    const db = schemaFaithfulClient(fixtures());
    expect(await loadPortal(db.client, 'c3'.repeat(32), noSign)).toBeNull();
    const before = db.queries.length;
    for (const bad of ['', 'not-a-token', 'A1'.repeat(32), 'a1'.repeat(31)]) {
      expect(await loadPortal(db.client, bad, noSign)).toBeNull();
    }
    expect(db.queries.length).toBe(before);
  });

  it('fails closed on a query error, and logs without the token', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    for (const table of ['vehicles', 'invoices', 'estimates', 'payments', 'customer_portal_tokens']) {
      const db = schemaFaithfulClient(fixtures());
      db.failNext(table, '42703');
      expect([table, await loadPortal(db.client, TOK_A, noSign)]).toEqual([table, null]);
    }
    expect(JSON.stringify(spy.mock.calls)).not.toContain(TOK_A);
    spy.mockRestore();
  });
});
