/**
 * Repair order value (labor + parts) for Reports, kept per currency.
 *
 * Each repair order is priced in its own currency (D1 works in THB and USD),
 * and there are no exchange rates. Reports used to add every RO's labor and
 * parts into one number shown with "$", so baht amounts were reported as
 * dollars. Totals here are never converted or added across currencies.
 */
import { addMoney, type MoneyTotals } from '@/lib/currencies';

export interface RoValue {
  currency: string | null | undefined;
  labor: number;
  parts: number;
}

export interface RoValueTotals {
  labor: MoneyTotals;
  parts: MoneyTotals;
  total: MoneyTotals;
}

/** Labor and parts value of one `repair_orders` row, in that row's currency. */
export function repairOrderValue(r: {
  labor_hours?: unknown; labor_rate?: unknown; parts_total?: unknown; currency?: unknown;
}): RoValue {
  return {
    currency: typeof r.currency === 'string' ? r.currency : null,
    labor: Number(r.labor_hours ?? 0) * Number(r.labor_rate ?? 0),
    parts: Number(r.parts_total ?? 0),
  };
}

/** Labor, parts and labor + parts, each per currency. A missing currency counts as USD, as ROs default to. */
export function sumRoValues(items: readonly RoValue[]): RoValueTotals {
  const out: RoValueTotals = { labor: {}, parts: {}, total: {} };
  for (const v of items) {
    if (v.labor === 0 && v.parts === 0) continue;
    addMoney(out.labor, v.currency, v.labor);
    addMoney(out.parts, v.currency, v.parts);
    addMoney(out.total, v.currency, v.labor + v.parts);
  }
  return out;
}
