/**
 * What people are paid, and what they have been lent against it.
 *
 * ## Salary is a series, not a number
 *
 * `technicians.pay_rate` holds one figure. It cannot answer "what were they
 * paid in March", which is the question payroll asks every time it runs, and
 * overwriting it destroys the only evidence of what someone used to earn —
 * the record a person reaches for when they dispute a payslip.
 *
 * So each change is a new row with the date it starts applying. There is no
 * end date: a row ends when the next one begins, so two rows cannot disagree
 * about what someone earned on a given day. Nothing is ever updated, only
 * inserted, and `salaryOn()` answers the question for any date.
 *
 * ## Advances are money, so approving and paying are separate
 *
 * An advance can be agreed on Monday and handed over on Friday, and payroll
 * must deduct what was PAID, not what was promised. `repaid_amount` is what
 * has since been recovered; the outstanding balance is derived, never stored,
 * because a stored total is a second copy of a sum that can drift.
 *
 * ## Reading someone's pay
 *
 * The capability gates whether a screen offers to ask. What actually stops one
 * person reading another's pay is the RLS policy, which matches
 * `employees.user_id` against `auth.uid()`. That is deliberate: this layer is
 * the second line, not the boundary.
 */
import type { DomainDeps } from './db';
import { writeAuditEvent, AUDIT } from './audit';
import { requireCapability } from './context';

export type PayType = 'Monthly' | 'Daily' | 'Hourly' | 'Per job';

export const PAY_TYPES: readonly PayType[] = ['Monthly', 'Daily', 'Hourly', 'Per job'];

export type AdvanceStatus = 'Pending' | 'Approved' | 'Paid' | 'Rejected' | 'Cancelled';

export interface SalaryRecord {
  id: string;
  organizationId: string;
  employeeId: string;
  effectiveFrom: string;
  payType: PayType;
  amount: number;
  currency: string;
  notes: string;
  recordedBy: string | null;
  createdAt: string;
}

export interface SalaryAdvance {
  id: string;
  organizationId: string;
  employeeId: string;
  amount: number;
  currency: string;
  requestedOn: string;
  reason: string;
  status: AdvanceStatus;
  paidOn: string | null;
  repaidAmount: number;
  requestedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string;
  createdAt: string;
}

export interface SalaryInput {
  employeeId: string;
  effectiveFrom: string;
  payType: PayType;
  amount: number;
  currency: string;
  notes?: string;
}

export interface AdvanceInput {
  employeeId: string;
  amount: number;
  currency: string;
  reason?: string;
  requestedOn?: string;
}

export class SalaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SalaryError';
  }
}

function mapSalary(row: Record<string, unknown>): SalaryRecord {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    employeeId: row.employee_id as string,
    effectiveFrom: row.effective_from as string,
    payType: (row.pay_type as PayType) ?? 'Monthly',
    amount: Number(row.amount ?? 0),
    currency: (row.currency as string) ?? 'USD',
    notes: (row.notes as string) ?? '',
    recordedBy: (row.recorded_by as string) ?? null,
    createdAt: (row.created_at as string) ?? '',
  };
}

function mapAdvance(row: Record<string, unknown>): SalaryAdvance {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    employeeId: row.employee_id as string,
    amount: Number(row.amount ?? 0),
    currency: (row.currency as string) ?? 'USD',
    requestedOn: row.requested_on as string,
    reason: (row.reason as string) ?? '',
    status: (row.status as AdvanceStatus) ?? 'Pending',
    paidOn: (row.paid_on as string) ?? null,
    repaidAmount: Number(row.repaid_amount ?? 0),
    requestedBy: (row.requested_by as string) ?? null,
    decidedBy: (row.decided_by as string) ?? null,
    decidedAt: (row.decided_at as string) ?? null,
    decisionNote: (row.decision_note as string) ?? '',
    createdAt: (row.created_at as string) ?? '',
  };
}

/**
 * The rate that applied on a given date.
 *
 * The most recent row starting on or before that date. A future-dated rise is
 * correctly ignored for a payroll run covering last month — which is the whole
 * reason for storing a start date rather than a current value.
 *
 * Returns null when the history starts after the date asked about: somebody
 * hired in June has no March salary, and inventing one would be worse than
 * saying so.
 */
export function salaryOn(history: readonly SalaryRecord[], date: string): SalaryRecord | null {
  const applicable = history
    .filter(record => record.effectiveFrom <= date)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return applicable[0] ?? null;
}

/**
 * What is still owed on an advance.
 *
 * Only PAID advances count. One that is approved but not yet handed over is
 * not a debt — deducting it from someone's pay would be taking back money they
 * never received.
 */
export function outstandingFrom(advances: readonly SalaryAdvance[]): { currency: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const advance of advances) {
    if (advance.status !== 'Paid') continue;
    const remaining = advance.amount - advance.repaidAmount;
    if (remaining <= 0) continue;
    totals.set(advance.currency, (totals.get(advance.currency) ?? 0) + remaining);
  }
  // Kept per currency rather than summed. This shop pays in USD, THB and LAK,
  // and adding them into one number would be meaningless — and wrong by a
  // factor of about twenty thousand between the extremes.
  return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
}

export function createSalaryDomain({ db, context }: DomainDeps) {
  function organizationId(): string {
    if (!context.organizationId) {
      throw new SalaryError('This shop is not linked to a business yet, so pay cannot be recorded.');
    }
    return context.organizationId;
  }

  // ── Salary ────────────────────────────────────────────────────────────────

  /**
   * Every rate ever set for one person, newest first.
   *
   * Gated on salary.read_own, which everyone has: RLS decides whose rows come
   * back. An owner sees anyone's, a technician sees their own and gets an
   * empty list for anyone else — not an error, because the existence of
   * another person's salary record is itself something they should not learn.
   */
  async function history(employeeId: string): Promise<SalaryRecord[]> {
    requireCapability(context, 'salary.read_own', 'see pay');
    const { data, error } = await db
      .from('salary_records')
      .select('*')
      .eq('organization_id', organizationId())
      .eq('employee_id', employeeId)
      .order('effective_from', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapSalary);
  }

  /** Current rates for everyone the caller may see, one row per person. */
  async function currentForAll(onDate?: string): Promise<SalaryRecord[]> {
    requireCapability(context, 'salary.read_all', "see everyone's pay");
    const asOf = onDate ?? new Date().toISOString().slice(0, 10);
    const { data, error } = await db
      .from('salary_records')
      .select('*')
      .eq('organization_id', organizationId())
      .lte('effective_from', asOf)
      .order('effective_from', { ascending: false });
    if (error) throw error;

    const rows = (data ?? []).map(mapSalary);
    const latest = new Map<string, SalaryRecord>();
    for (const row of rows) {
      // Rows arrive newest first, so the first one seen for a person wins.
      if (!latest.has(row.employeeId)) latest.set(row.employeeId, row);
    }
    return [...latest.values()];
  }

  /**
   * Set a rate from a date.
   *
   * An insert, never an update. Correcting a mistake means adding the right
   * row; a wrong row that was never used is harmless next to a history that
   * can be rewritten.
   */
  async function setSalary(input: SalaryInput): Promise<SalaryRecord> {
    requireCapability(context, 'salary.manage', 'set pay rates');

    if (!PAY_TYPES.includes(input.payType)) {
      throw new SalaryError(input.payType + ' is not a pay type this system knows.');
    }
    if (!Number.isFinite(input.amount) || input.amount < 0) {
      throw new SalaryError('A pay rate cannot be negative.');
    }
    if (!input.currency) {
      throw new SalaryError('Pay has to be recorded in a currency.');
    }

    const { data, error } = await db
      .from('salary_records')
      .insert({
        organization_id: organizationId(),
        employee_id: input.employeeId,
        effective_from: input.effectiveFrom,
        pay_type: input.payType,
        amount: input.amount,
        currency: input.currency,
        notes: input.notes ?? '',
        recorded_by: context.actor.userId ?? null,
      })
      .select()
      .single();

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new SalaryError(
          'A rate already starts on that date for this person. Pick a different date, ' +
          'or record the correction from the day it actually takes effect.',
        );
      }
      throw error;
    }

    const record = mapSalary(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.salarySet,
      entityType: 'salary_record',
      entityId: record.id,
      after: {
        employeeId: record.employeeId, effectiveFrom: record.effectiveFrom,
        payType: record.payType, amount: record.amount, currency: record.currency,
      },
    });
    return record;
  }

  // ── Advances ──────────────────────────────────────────────────────────────

  async function listAdvances(options: { employeeId?: string; status?: AdvanceStatus } = {}): Promise<SalaryAdvance[]> {
    requireCapability(context, 'salary_advances.request', 'see advances');
    let query = db
      .from('salary_advances')
      .select('*')
      .eq('organization_id', organizationId());
    if (options.employeeId) query = query.eq('employee_id', options.employeeId);
    if (options.status) query = query.eq('status', options.status);
    const { data, error } = await query.order('requested_on', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapAdvance);
  }

  async function requestAdvance(input: AdvanceInput): Promise<SalaryAdvance> {
    requireCapability(context, 'salary_advances.request', 'request an advance');

    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new SalaryError('An advance has to be for more than nothing.');
    }
    if (!input.currency) {
      throw new SalaryError('An advance has to be in a currency.');
    }

    const { data, error } = await db
      .from('salary_advances')
      .insert({
        organization_id: organizationId(),
        employee_id: input.employeeId,
        amount: input.amount,
        currency: input.currency,
        requested_on: input.requestedOn ?? new Date().toISOString().slice(0, 10),
        reason: input.reason ?? '',
        status: 'Pending',
        requested_by: context.actor.userId ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    const advance = mapAdvance(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.advanceRequested,
      entityType: 'salary_advance',
      entityId: advance.id,
      after: {
        employeeId: advance.employeeId, amount: advance.amount,
        currency: advance.currency, requestedOn: advance.requestedOn,
      },
    });
    return advance;
  }

  async function decideAdvance(
    id: string,
    decision: 'Approved' | 'Rejected',
    note = '',
  ): Promise<SalaryAdvance> {
    requireCapability(context, 'salary_advances.approve', 'approve an advance');

    const { data, error } = await db
      .from('salary_advances')
      .update({
        status: decision,
        decided_by: context.actor.userId ?? null,
        decided_at: new Date().toISOString(),
        decision_note: note,
      })
      .eq('id', id)
      .eq('organization_id', organizationId())
      .eq('status', 'Pending')   // nobody else decided it while this was in flight
      .select()
      .single();
    if (error) throw error;
    if (!data) throw new SalaryError('That advance was already decided.');

    const advance = mapAdvance(data);
    await writeAuditEvent(db, context, {
      action: decision === 'Approved' ? AUDIT.advanceApproved : AUDIT.advanceRejected,
      entityType: 'salary_advance',
      entityId: advance.id,
      before: { status: 'Pending' },
      after: { status: advance.status, amount: advance.amount, currency: advance.currency },
    });
    return advance;
  }

  /**
   * Record that the money was actually handed over.
   *
   * Separate from approval because payroll deducts what was paid, not what was
   * agreed, and because an advance approved but never handed over must not
   * become a deduction from somebody's wages.
   */
  async function markAdvancePaid(id: string, paidOn?: string): Promise<SalaryAdvance> {
    requireCapability(context, 'salary_advances.approve', 'record an advance as paid');

    const { data, error } = await db
      .from('salary_advances')
      .update({
        status: 'Paid',
        paid_on: paidOn ?? new Date().toISOString().slice(0, 10),
      })
      .eq('id', id)
      .eq('organization_id', organizationId())
      .eq('status', 'Approved')   // only an approved advance can be paid
      .select()
      .single();
    if (error) throw error;
    if (!data) throw new SalaryError('That advance has not been approved, so it cannot be marked paid.');

    const advance = mapAdvance(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.advancePaid,
      entityType: 'salary_advance',
      entityId: advance.id,
      before: { status: 'Approved' },
      after: { status: 'Paid', amount: advance.amount, currency: advance.currency, paidOn: advance.paidOn },
    });
    return advance;
  }

  /** What each person still owes, per currency. */
  async function outstanding(employeeId?: string): Promise<{ currency: string; amount: number }[]> {
    const advances = await listAdvances(employeeId ? { employeeId } : {});
    return outstandingFrom(advances);
  }

  return {
    history, currentForAll, setSalary,
    listAdvances, requestAdvance, decideAdvance, markAdvancePaid, outstanding,
  };
}
