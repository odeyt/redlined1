/**
 * Compatibility wrapper for the daily cash reconciliation domain.
 *
 * Closing and reopening go through database functions rather than this layer,
 * because the rules they enforce — every line counted, every difference
 * explained — have to hold whatever calls them.
 */
import { browserDeps } from '@/lib/domain/browserAdapter';
import {
  createCashDayDomain, expectedCashFor, varianceOf, blockersFor,
  CASH_METHODS, CashDayError,
  type CashDay, type CashDayLine, type CashDayStatus, type ExpectedCash,
} from '@/lib/domain/cashDay';

export type { CashDay, CashDayLine, CashDayStatus, ExpectedCash };
export { expectedCashFor, varianceOf, blockersFor, CASH_METHODS, CashDayError };

async function domain() {
  return createCashDayDomain(await browserDeps());
}

export async function fetchCashDays(from: string, to: string): Promise<CashDay[]> {
  return (await domain()).listDays(from, to);
}

export async function fetchCashDayLines(dayId: string): Promise<CashDayLine[]> {
  return (await domain()).linesFor(dayId);
}

/** Opens the day, or returns the one already open for that date. */
export async function openCashDay(businessDate: string): Promise<CashDay> {
  return (await domain()).openDay(businessDate);
}

export async function saveCashDayLines(
  dayId: string,
  lines: readonly Omit<CashDayLine, 'id' | 'dayId'>[],
): Promise<CashDayLine[]> {
  return (await domain()).saveLines(dayId, lines);
}

export async function closeCashDay(dayId: string, notes?: string): Promise<{ currencies: number; totalVariance: number }> {
  return (await domain()).close(dayId, notes);
}

/** Needs a reason. The original close details are kept, not overwritten. */
export async function reopenCashDay(dayId: string, reason: string): Promise<void> {
  return (await domain()).reopen(dayId, reason);
}
