/**
 * Closing the day.
 *
 * Count what is in the till, compare it to what the records say should be
 * there, explain the difference. That is the whole feature.
 *
 * ## What counts as cash
 *
 * Payments recorded with a cash method, minus expenses paid in cash. Card, QR
 * and bank transfers never touch the drawer, so including them would produce
 * an expected figure nobody could ever match.
 *
 * `Other (Cash)` counts. It exists in the payment methods list precisely for
 * cash that does not fit the usual flow, and it lands in the same drawer.
 *
 * ## Per currency
 *
 * The drawer holds LAK, THB and USD. Each is counted and reconciled on its
 * own; there is no combined figure anywhere, because there is no such thing.
 *
 * ## Expected is snapshotted at close
 *
 * Same rule as payroll lines. A payment entered tomorrow but dated today would
 * otherwise change what a closed day claims it expected, and a closed day that
 * keeps moving is not a record.
 *
 * ## A variance is allowed, but must be explained
 *
 * Insisting the count matches is how you get a count that has been made to
 * match. The database enforces the explanation, not the match.
 */
import type { DomainDeps } from './db';
import { writeAuditEvent, AUDIT } from './audit';
import { requireCapability } from './context';
import { emitDomainEvent, DOMAIN_EVENTS } from './events';
import type { DomainPayment } from './payments';
import type { Expense } from './expenses';

/**
 * Payment methods that put notes and coins in the drawer.
 *
 * A set rather than a string test, so adding 'Petty cash' later is one edit in
 * one place and every screen agrees about it.
 */
export const CASH_METHODS: ReadonlySet<string> = new Set(['Cash', 'Other (Cash)']);

export type CashDayStatus = 'Open' | 'Closed';

export interface CashDay {
  id: string;
  organizationId: string;
  shopId: string;
  businessDate: string;
  status: CashDayStatus;
  closedBy: string | null;
  closedAt: string | null;
  reopenedBy: string | null;
  reopenedAt: string | null;
  reopenReason: string;
  notes: string;
}

export interface CashDayLine {
  id: string;
  dayId: string;
  currency: string;
  openingFloat: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  countedCash: number | null;
  variance: number | null;
  notes: string;
}

/** What the records say should be in the drawer, per currency. */
export interface ExpectedCash {
  currency: string;
  cashIn: number;
  cashOut: number;
  /** openingFloat + cashIn − cashOut */
  expected: number;
}

export class CashDayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CashDayError';
  }
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function mapDay(row: Record<string, unknown>): CashDay {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    shopId: row.shop_id as string,
    businessDate: row.business_date as string,
    status: (row.status as CashDayStatus) ?? 'Open',
    closedBy: (row.closed_by as string) ?? null,
    closedAt: (row.closed_at as string) ?? null,
    reopenedBy: (row.reopened_by as string) ?? null,
    reopenedAt: (row.reopened_at as string) ?? null,
    reopenReason: (row.reopen_reason as string) ?? '',
    notes: (row.notes as string) ?? '',
  };
}

function mapLine(row: Record<string, unknown>): CashDayLine {
  return {
    id: row.id as string,
    dayId: row.day_id as string,
    currency: (row.currency as string) ?? 'USD',
    openingFloat: Number(row.opening_float ?? 0),
    cashIn: Number(row.cash_in ?? 0),
    cashOut: Number(row.cash_out ?? 0),
    expectedCash: Number(row.expected_cash ?? 0),
    countedCash: row.counted_cash === null || row.counted_cash === undefined
      ? null : Number(row.counted_cash),
    variance: row.variance === null || row.variance === undefined
      ? null : Number(row.variance),
    notes: (row.notes as string) ?? '',
  };
}

/**
 * Work out what should be in the drawer, per currency.
 *
 * Reversals are negative payment entries, so a plain sum is already net of
 * them — a refund given in cash correctly reduces what the drawer should hold.
 *
 * Only APPROVED expenses count. A pending claim is a request, and money for it
 * has not left the till on the say-so of the claim alone.
 */
export function expectedCashFor(
  payments: readonly DomainPayment[],
  expenses: readonly Expense[],
  businessDate: string,
  shopId: string,
  openingFloats: Readonly<Record<string, number>> = {},
): ExpectedCash[] {
  const totals = new Map<string, { cashIn: number; cashOut: number }>();

  const bump = (currency: string, field: 'cashIn' | 'cashOut', amount: number) => {
    const current = totals.get(currency) ?? { cashIn: 0, cashOut: 0 };
    current[field] = money(current[field] + amount);
    totals.set(currency, current);
  };

  for (const payment of payments) {
    if (!CASH_METHODS.has(payment.method)) continue;
    // paymentDate can carry a time; the day is what matters.
    if ((payment.paymentDate ?? '').slice(0, 10) !== businessDate) continue;
    bump(payment.currency, 'cashIn', payment.amount);
  }

  for (const expense of expenses) {
    if (expense.status !== 'Approved') continue;
    if (expense.paymentMethod !== 'Cash') continue;
    if (expense.shopId !== shopId) continue;
    if (expense.spentOn !== businessDate) continue;
    bump(expense.currency, 'cashOut', expense.amount);
  }

  // A currency with an opening float but no movement still needs a line —
  // otherwise yesterday's float silently vanishes from today's count.
  for (const currency of Object.keys(openingFloats)) {
    if (!totals.has(currency)) totals.set(currency, { cashIn: 0, cashOut: 0 });
  }

  return [...totals.entries()].map(([currency, t]) => ({
    currency,
    cashIn: t.cashIn,
    cashOut: t.cashOut,
    expected: money((openingFloats[currency] ?? 0) + t.cashIn - t.cashOut),
  }));
}

/** counted − expected. Null until somebody has counted. */
export function varianceOf(countedCash: number | null, expectedCash: number): number | null {
  if (countedCash === null) return null;
  return money(countedCash - expectedCash);
}

/** Whether this day can be closed, and what is stopping it if not. */
export function blockersFor(lines: readonly CashDayLine[]): string[] {
  const blockers: string[] = [];
  if (lines.length === 0) return ['Nothing has been counted yet.'];

  for (const line of lines) {
    if (line.countedCash === null) {
      blockers.push('The ' + line.currency + ' cash has not been counted.');
      continue;
    }
    const variance = varianceOf(line.countedCash, line.expectedCash);
    if (variance !== 0 && !line.notes.trim()) {
      blockers.push('The ' + line.currency + ' count is out by ' + variance + ' — say why.');
    }
  }
  return blockers;
}

export function createCashDayDomain({ db, context }: DomainDeps) {
  function organizationId(): string {
    if (!context.organizationId) {
      throw new CashDayError('This shop is not linked to a business yet, so the day cannot be closed.');
    }
    return context.organizationId;
  }

  function shopId(): string {
    if (!context.shopId) throw new CashDayError('No shop is selected.');
    return context.shopId;
  }

  async function listDays(from: string, to: string): Promise<CashDay[]> {
    requireCapability(context, 'reconciliation.manage', 'see the daily cash record');
    const { data, error } = await db
      .from('cash_days')
      .select('*')
      .eq('shop_id', shopId())
      .gte('business_date', from)
      .lte('business_date', to)
      .order('business_date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapDay);
  }

  async function linesFor(dayId: string): Promise<CashDayLine[]> {
    requireCapability(context, 'reconciliation.manage', 'see the daily cash record');
    const { data, error } = await db
      .from('cash_day_lines').select('*').eq('day_id', dayId).order('currency');
    if (error) throw error;
    return (data ?? []).map(mapLine);
  }

  /** Open the day, or return the one already open for that date. */
  async function openDay(businessDate: string): Promise<CashDay> {
    requireCapability(context, 'reconciliation.manage', 'close the day');

    const { data: existing, error: readError } = await db
      .from('cash_days').select('*')
      .eq('shop_id', shopId()).eq('business_date', businessDate).maybeSingle();
    if (readError) throw readError;
    if (existing) return mapDay(existing);

    const { data, error } = await db
      .from('cash_days')
      .insert({
        organization_id: organizationId(),
        shop_id: shopId(),
        business_date: businessDate,
        status: 'Open',
      })
      .select()
      .single();
    if (error) throw error;

    const day = mapDay(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.cashDayOpened,
      entityType: 'cash_day',
      entityId: day.id,
      after: { businessDate: day.businessDate, shopId: day.shopId },
    });
    return day;
  }

  /**
   * Write the counted figures and the expected snapshot.
   *
   * Replaces the day's lines wholesale: recounting is the normal way to use an
   * open day, and merging would leave a line for a currency that turned out
   * not to be in the drawer.
   */
  async function saveLines(
    dayId: string,
    lines: readonly Omit<CashDayLine, 'id' | 'dayId'>[],
  ): Promise<CashDayLine[]> {
    requireCapability(context, 'reconciliation.manage', 'record the cash count');

    const { data: day, error: dayError } = await db
      .from('cash_days').select('status').eq('id', dayId).maybeSingle();
    if (dayError) throw dayError;
    if (!day) throw new CashDayError('That day no longer exists.');
    if (day.status !== 'Open') {
      throw new CashDayError('That day is closed. Reopen it first, with a reason.');
    }

    const { error: clearError } = await db.from('cash_day_lines').delete().eq('day_id', dayId);
    if (clearError) throw clearError;

    if (lines.length === 0) return [];

    const { data, error } = await db
      .from('cash_day_lines')
      .insert(lines.map(line => ({
        day_id: dayId,
        currency: line.currency,
        opening_float: line.openingFloat,
        cash_in: line.cashIn,
        cash_out: line.cashOut,
        expected_cash: line.expectedCash,
        counted_cash: line.countedCash,
        // Computed here rather than taken from the caller: the close function
        // rejects a variance that disagrees with its own inputs, and there is
        // no reason to let a browser be the one that gets it wrong.
        variance: varianceOf(line.countedCash, line.expectedCash),
        notes: line.notes,
      })))
      .select();
    if (error) throw error;
    return (data ?? []).map(mapLine);
  }

  /**
   * Close the day.
   *
   * The database does the checking — every line counted, every difference
   * explained, every variance agreeing with its inputs — because those rules
   * have to hold whatever calls them.
   */
  async function close(dayId: string, notes?: string): Promise<{ currencies: number; totalVariance: number }> {
    requireCapability(context, 'reconciliation.manage', 'close the day');

    const { data, error } = await db.rpc('close_cash_day', { p_day_id: dayId, p_notes: notes ?? null });
    if (error) throw new CashDayError(error.message);

    const result = Array.isArray(data) ? data[0] : data;
    const currencies = Number(result?.currencies ?? 0);
    const totalVariance = Number(result?.total_variance ?? 0);

    await emitDomainEvent(db, context, {
      eventType: DOMAIN_EVENTS.cashDayClosed,
      aggregateType: 'cash_day',
      aggregateId: dayId,
      payload: { currencies, totalVariance },
      idempotencyKey: 'cash_day.closed:' + dayId,
    });

    await writeAuditEvent(db, context, {
      action: AUDIT.cashDayClosed,
      entityType: 'cash_day',
      entityId: dayId,
      after: { currencies, totalVariance },
    });
    return { currencies, totalVariance };
  }

  /** Reopen a closed day. Needs a reason, and keeps the original close intact. */
  async function reopen(dayId: string, reason: string): Promise<void> {
    requireCapability(context, 'reconciliation.manage', 'reopen a closed day');
    if (!reason.trim()) throw new CashDayError('Reopening a closed day needs a reason.');

    const { error } = await db.rpc('reopen_cash_day', { p_day_id: dayId, p_reason: reason });
    if (error) throw new CashDayError(error.message);

    await writeAuditEvent(db, context, {
      action: AUDIT.cashDayReopened,
      entityType: 'cash_day',
      entityId: dayId,
      after: { reason },
    });
  }

  return { listDays, linesFor, openDay, saveLines, close, reopen };
}
