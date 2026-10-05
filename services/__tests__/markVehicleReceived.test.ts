/**
 * Intake stamps the vehicle's received date, scoped to the caller's shops.
 * The Vehicle Intake report places a car in a month by vehicles.date_received,
 * so a car taken in again must carry the new arrival date.
 */
const calls: { op: string; payload?: unknown; eq?: [string, unknown]; in?: [string, unknown[]] }[] = [];
let nextError: { message: string } | null = null;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const call: (typeof calls)[number] & { table?: string } = { op: 'update' };
      calls.push(call);
      const chain = {
        update: (payload: unknown) => { call.payload = payload; (call as { table?: string }).table = table; return chain; },
        eq: (col: string, val: unknown) => { call.eq = [col, val]; return chain; },
        in: (col: string, vals: unknown[]) => { call.in = [col, vals]; return Promise.resolve({ error: nextError }); },
      };
      return chain;
    },
  },
}));
jest.mock('@/lib/shopStore', () => ({
  getShopId: () => 'shop-1',
  getShopIds: () => ['shop-1', 'shop-2'],
}));
jest.mock('@/lib/domain/auditFromBrowser', () => ({ recordAudit: jest.fn() }));

import { markVehicleReceived } from '../vehicleService';

beforeEach(() => { calls.length = 0; nextError = null; });

describe('markVehicleReceived', () => {
  it('sets date_received to the given day, only on that vehicle, only in the caller\'s shops', async () => {
    await markVehicleReceived('veh-1', '2026-10-05');
    expect(calls).toHaveLength(1);
    expect(calls[0].payload).toEqual({ date_received: '2026-10-05' });
    expect(calls[0].eq).toEqual(['id', 'veh-1']);
    expect(calls[0].in).toEqual(['shop_id', ['shop-1', 'shop-2']]);
  });

  it('trims a full timestamp to the date', async () => {
    await markVehicleReceived('veh-1', '2026-10-05T08:30');
    expect(calls[0].payload).toEqual({ date_received: '2026-10-05' });
  });

  it('defaults to today when no date is given', async () => {
    await markVehicleReceived('veh-1');
    expect((calls[0].payload as { date_received: string }).date_received).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('raises the database error so a caller can decide it is non-fatal', async () => {
    nextError = { message: 'permission denied' };
    await expect(markVehicleReceived('veh-1', '2026-10-05')).rejects.toEqual({ message: 'permission denied' });
  });
});
