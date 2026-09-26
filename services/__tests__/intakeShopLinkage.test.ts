/**
 * The records an intake creates land in the ACTIVE shop, with the id the
 * intake settled — asserted at the insert, with Supabase mocked.
 *
 * The intake relies on two optional parameters added for it:
 *   - createJobCard({ checkInDate }) — the arrival staff recorded;
 *   - createPartsEstimate(o, { id }) — the id that makes a retry collide.
 * Both must leave every existing caller's insert exactly as it was.
 */

const inserts: { table: string; row: Record<string, unknown> }[] = [];

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return { select: () => ({ single: async () => ({ data: { ...row, id: row.id ?? 'generated-id' }, error: null }) }) };
      },
    }),
  },
}));
jest.mock('@/lib/shopStore', () => ({
  getShopId: () => 'shop-location-2',
  getShopIds: () => ['shop-location-2', 'shop-1'],
}));
jest.mock('@/lib/domain/auditFromBrowser', () => ({ recordAudit: jest.fn(async () => {}) }));
// Fire-and-forget hooks inside createJobCard; never part of what is asserted.
jest.mock('@/intelligence/IntelligenceService', () => ({ publishEvent: jest.fn() }));
jest.mock('@/lib/sapelee/publish', () => ({ publishSapeleeEvent: jest.fn() }));

import { createJobCard } from '../jobCardService';
import { createPartsEstimate } from '../partsEstimateService';

beforeEach(() => { inserts.length = 0; });

const JOB = {
  customer: 'Pat Owner', vehicle: '2019 Ford F-150', serviceType: 'A/C', channel: 'Shop bay',
  location: 'Bay 1', technicians: [], priority: 'Normal', approvalCode: '',
};

describe('createJobCard', () => {
  it('writes the active shop, the settled id and the recorded arrival', async () => {
    await createJobCard({ ...JOB, id: 'JC-INTAKE-1', checkInDate: '2026-09-26T01:45:00.000Z' });

    const { table, row } = inserts[0];
    expect(table).toBe('job_cards');
    expect(row).toMatchObject({ id: 'JC-INTAKE-1', shop_id: 'shop-location-2', check_in_date: '2026-09-26T01:45:00.000Z' });
  });

  it('still defaults the arrival to now for existing callers', async () => {
    const before = Date.now();
    await createJobCard(JOB);
    const at = Date.parse(inserts[0].row.check_in_date as string);
    expect(at).toBeGreaterThanOrEqual(before);
  });
});

describe('createPartsEstimate', () => {
  const QUOTE = {
    lineItems: [], partName: 'Brake pads', partNumber: '', condition: 'New', quantity: 1, unitCost: 0,
    vendorName: '', vendorPhone: '', vendorEmail: '', coreCharge: 0, totalCost: 0, deposit: 0,
    depositCurrency: 'USD', status: 'Draft', quoteDate: '2026-09-26', validUntil: '',
    jobCardNumber: '', repairOrderNumber: '', vehicle: '', customerName: 'Pat Owner', notes: '', currency: 'USD',
  };

  it('writes the active shop and the settled id when one is given', async () => {
    await createPartsEstimate(QUOTE, { id: '11111111-2222-4333-8444-555555555555' });
    expect(inserts[0].row).toMatchObject({ id: '11111111-2222-4333-8444-555555555555', shop_id: 'shop-location-2' });
  });

  it('sends no id at all for existing callers, so the database generates it', async () => {
    await createPartsEstimate(QUOTE);
    expect('id' in inserts[0].row).toBe(false);
    expect(inserts[0].row.shop_id).toBe('shop-location-2');
  });
});
