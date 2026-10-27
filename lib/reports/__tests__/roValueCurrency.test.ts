/**
 * Reports → repair order value must not add baht to dollars.
 *
 * Same bug as Employees → Total Revenue Generated (fixed 2026-10-27): Reports
 * summed every RO's labor_hours * labor_rate and parts_total into one number
 * shown with "$", without looking at repair_orders.currency. RO value is now
 * kept per currency and never converted.
 */
import * as fs from 'fs';
import * as path from 'path';
import { repairOrderValue, sumRoValues } from '../roValue';
import { formatMoneyTotals } from '@/lib/currencies';

const norm = (s: string) => s.replace(/[  \s]/g, '');

describe('repair order value per currency', () => {
  it('keeps THB and USD repair orders apart', () => {
    const t = sumRoValues([
      { labor_hours: 0, labor_rate: 0, parts_total: 480000, currency: 'THB' },
      { labor_hours: 2, labor_rate: 50, parts_total: 150, currency: 'USD' },
    ].map(repairOrderValue));
    expect(t.total).toEqual({ THB: 480000, USD: 250 });
    expect(t.labor).toEqual({ THB: 0, USD: 100 });
    expect(t.parts).toEqual({ THB: 480000, USD: 150 });
    expect(norm(formatMoneyTotals(t.total))).toBe('THB480,000.00+$250.00');
  });

  it('counts a repair order with no currency as USD, as the RO screen does', () => {
    const t = sumRoValues([repairOrderValue({ labor_hours: 1, labor_rate: 40, parts_total: null, currency: null })]);
    expect(t.total).toEqual({ USD: 40 });
  });

  it('reads string amounts from the database as numbers', () => {
    const t = sumRoValues([repairOrderValue({ labor_hours: '1.5', labor_rate: '1000', parts_total: '500', currency: 'THB' })]);
    expect(t.total).toEqual({ THB: 2000 });
  });

  it('leaves zero-value jobs out instead of showing them as $0.00', () => {
    const t = sumRoValues([
      { currency: 'USD', labor: 0, parts: 0 },
      { currency: 'THB', labor: 300, parts: 0 },
    ]);
    expect(t.total).toEqual({ THB: 300 });
    expect(norm(formatMoneyTotals(sumRoValues([]).total))).toBe('$0.00');
  });
});

describe('ReportsView', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../../features/reports/ReportsView.tsx'), 'utf8');

  it('selects currency on every repair_orders query', () => {
    const selects = [...src.matchAll(/from\('repair_orders'\)\s*\.select\('([^']*)'\)/g)].map(m => m[1]);
    expect(selects.length).toBeGreaterThanOrEqual(2);
    for (const s of selects) expect(s.split(/\s*,\s*/)).toContain('currency');
  });

  it('never shows RO value through the single-currency "$" formatter', () => {
    expect(src).not.toMatch(/fmtMoney\([^)]*(ROValue|LaborValue|PartsValue|grandTotal|partsTotal|laborRate)/);
  });
});
