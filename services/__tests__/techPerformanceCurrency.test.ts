/**
 * Employees → Total Revenue Generated must not add baht to dollars.
 *
 * Reported from production 2026-10-27: the card read "$509,701.30". Repair
 * orders are priced in THB or USD, and the performance figures summed every
 * RO's labor and parts into one number shown with "$", so baht amounts were
 * reported as dollars. Money is now kept per currency, and Void ROs are left
 * out of it, as in Reports.
 */
const rows: { ros: Record<string, unknown>[]; jcs: Record<string, unknown>[] } = { ros: [], jcs: [] };

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => Promise.resolve({ data: table === 'repair_orders' ? rows.ros : rows.jcs, error: null }),
      }),
    }),
  },
}));
jest.mock('@/lib/shopStore', () => ({
  getShopId: () => 'shop-1',
  getShopIds: () => ['shop-1'],
}));
jest.mock('@/lib/domain/auditFromBrowser', () => ({ recordAudit: jest.fn() }));

import { fetchTechPerformance } from '../technicianService';
import { addMoney, formatMoneyTotals, sumMoney } from '@/lib/currencies';

const norm = (s: string) => s.replace(/[  \s]/g, '');

beforeEach(() => { rows.ros = []; rows.jcs = []; });

describe('technician performance money', () => {
  it('keeps THB and USD repair orders apart', async () => {
    rows.ros = [
      { technician: 'Somchai', status: 'Closed', labor_hours: 0, labor_rate: 0, parts_total: 480000, currency: 'THB' },
      { technician: 'Somchai', status: 'Closed', labor_hours: 2, labor_rate: 50, parts_total: 150, currency: 'USD' },
    ];
    const [p] = await fetchTechPerformance();
    expect(p.totalValue).toEqual({ THB: 480000, USD: 250 });
    expect(p.totalLaborValue).toEqual({ THB: 0, USD: 100 });
    expect(p.totalPartsValue).toEqual({ THB: 480000, USD: 150 });
  });

  it('counts a repair order with no currency as USD, as the RO screen does', async () => {
    rows.ros = [{ technician: 'A', status: 'Open', labor_hours: 1, labor_rate: 40, parts_total: 0, currency: null }];
    const [p] = await fetchTechPerformance();
    expect(p.totalValue).toEqual({ USD: 40 });
  });

  it('leaves Void repair orders out of revenue but still counts them', async () => {
    rows.ros = [
      { technician: 'A', status: 'Void', labor_hours: 0, labor_rate: 0, parts_total: 9999, currency: 'THB' },
      { technician: 'A', status: 'Closed', labor_hours: 0, labor_rate: 0, parts_total: 100, currency: 'THB' },
    ];
    const [p] = await fetchTechPerformance();
    expect(p.totalValue).toEqual({ THB: 100 });
    expect(p.roCount).toBe(2);
  });
});

describe('formatMoneyTotals', () => {
  it('shows each currency in its own format instead of one dollar figure', () => {
    const totals = sumMoney([{ THB: 480000 }, { USD: 250 }, { THB: 1000 }]);
    expect(totals).toEqual({ THB: 481000, USD: 250 });
    expect(norm(formatMoneyTotals(totals))).toBe('THB481,000.00+$250.00');
  });

  it('shows zero in the fallback currency when there is nothing', () => {
    expect(norm(formatMoneyTotals({}))).toBe('$0.00');
    expect(norm(formatMoneyTotals({ THB: 0 }, 'THB'))).toBe('THB0.00');
  });

  it('normalises currency codes when adding', () => {
    expect(addMoney({}, ' thb ', 5)).toEqual({ THB: 5 });
    expect(addMoney({}, '', 5)).toEqual({ USD: 5 });
  });
});
