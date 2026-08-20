/**
 * Payroll.
 *
 * ## Each person in their own currency
 *
 * No conversion anywhere. A run has a subtotal per currency and a person whose
 * rate is in THB is paid in THB. Converting would mean storing an exchange
 * rate with the run, and a wrong one makes reprinting last month's payslip
 * produce a different number a year later.
 *
 * ## The draft calculates, a person decides
 *
 * `calculateLine` produces a starting figure from the attendance and the rate
 * that applied during the period. It is a proposal, not an answer: a draft
 * line is editable, and the inputs it used are shown beside it so whoever
 * approves the run can see where the number came from.
 *
 * Two cases it deliberately does not guess:
 *
 *   * 'Per job' pay cannot be derived from attendance at all, so it comes back
 *     as zero with a note saying so
 *   * a monthly rate is NOT pro-rated for absence. Deciding that an absent day
 *     costs a twenty-sixth of a month is a policy this system has never been
 *     told, and quietly inventing a divisor is how somebody is underpaid by a
 *     rule nobody agreed to. Absent days are counted and displayed; what to do
 *     about them is left to a person.
 *
 * ## Finalising is a database function
 *
 * Recovering advances touches three tables and must be all-or-nothing, so it
 * is `finalise_payroll_run` rather than a sequence of calls from a browser
 * that might lose its connection halfway.
 */
import type { DomainDeps } from './db';
import { writeAuditEvent, AUDIT } from './audit';
import { requireCapability } from './context';
import { PRESENT_STATUSES, type AttendanceDay } from './attendance';
import { salaryOn, type SalaryRecord } from './salary';

export type PayrollStatus = 'Draft' | 'Finalised' | 'Paid';

export interface PayrollRun {
  id: string;
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  label: string;
  status: PayrollStatus;
  createdBy: string | null;
  finalisedBy: string | null;
  finalisedAt: string | null;
  paidAt: string | null;
  notes: string;
  createdAt: string;
}

export interface PayrollLine {
  id: string;
  runId: string;
  organizationId: string;
  employeeId: string;
  currency: string;
  payType: string;
  rateAmount: number;
  salaryRecordId: string | null;
  daysWorked: number;
  daysLeavePaid: number;
  daysAbsent: number;
  hoursWorked: number;
  gross: number;
  advanceDeducted: number;
  otherDeduction: number;
  net: number;
  notes: string;
}

/** What a line was calculated from, before anyone edits it. */
export interface CalculatedLine {
  employeeId: string;
  currency: string;
  payType: string;
  rateAmount: number;
  salaryRecordId: string | null;
  daysWorked: number;
  daysLeavePaid: number;
  daysAbsent: number;
  hoursWorked: number;
  gross: number;
  notes: string;
}

export class PayrollError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayrollError';
  }
}

function mapRun(row: Record<string, unknown>): PayrollRun {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    periodStart: row.period_start as string,
    periodEnd: row.period_end as string,
    label: (row.label as string) ?? '',
    status: (row.status as PayrollStatus) ?? 'Draft',
    createdBy: (row.created_by as string) ?? null,
    finalisedBy: (row.finalised_by as string) ?? null,
    finalisedAt: (row.finalised_at as string) ?? null,
    paidAt: (row.paid_at as string) ?? null,
    notes: (row.notes as string) ?? '',
    createdAt: (row.created_at as string) ?? '',
  };
}

function mapLine(row: Record<string, unknown>): PayrollLine {
  return {
    id: row.id as string,
    runId: row.run_id as string,
    organizationId: row.organization_id as string,
    employeeId: row.employee_id as string,
    currency: (row.currency as string) ?? 'USD',
    payType: (row.pay_type as string) ?? 'Monthly',
    rateAmount: Number(row.rate_amount ?? 0),
    salaryRecordId: (row.salary_record_id as string) ?? null,
    daysWorked: Number(row.days_worked ?? 0),
    daysLeavePaid: Number(row.days_leave_paid ?? 0),
    daysAbsent: Number(row.days_absent ?? 0),
    hoursWorked: Number(row.hours_worked ?? 0),
    gross: Number(row.gross ?? 0),
    advanceDeducted: Number(row.advance_deducted ?? 0),
    otherDeduction: Number(row.other_deduction ?? 0),
    net: Number(row.net ?? 0),
    notes: (row.notes as string) ?? '',
  };
}

/** Round to two decimals without the floating-point drift of toFixed chains. */
function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Turn one person's attendance and rate into a proposed line.
 *
 * `days` must already be filtered to the period. The rate used is whichever
 * one applied on the LAST day of the period — pay agreed mid-period applies to
 * the period it was agreed for, which is what a person expects when they are
 * told "you're on 700 from June".
 */
export function calculateLine(
  employeeId: string,
  salaryHistory: readonly SalaryRecord[],
  days: readonly AttendanceDay[],
  periodEnd: string,
): CalculatedLine {
  const rate = salaryOn(salaryHistory, periodEnd);

  const empty: CalculatedLine = {
    employeeId, currency: 'USD', payType: 'Monthly', rateAmount: 0,
    salaryRecordId: null, daysWorked: 0, daysLeavePaid: 0, daysAbsent: 0,
    hoursWorked: 0, gross: 0, notes: '',
  };

  if (!rate) {
    return { ...empty, notes: 'No pay rate recorded for this period — set one in Pay & Advances.' };
  }

  let daysWorked = 0;
  let daysLeavePaid = 0;
  let daysAbsent = 0;
  let minutes = 0;

  for (const day of days) {
    if (day.status === 'Half day') daysWorked += 0.5;
    else if (PRESENT_STATUSES.includes(day.status)) daysWorked += 1;
    else if (day.status === 'Leave') daysLeavePaid += 1;
    else if (day.status === 'Absent') daysAbsent += 1;
    // Holiday and Rest day are neither worked nor absent: nobody was expected
    // in, and counting them either way would distort both numbers.
    minutes += day.minutesWorked ?? 0;
  }

  const hoursWorked = money(minutes / 60);

  let gross = 0;
  let notes = '';

  switch (rate.payType) {
    case 'Hourly':
      gross = money(rate.amount * hoursWorked);
      if (hoursWorked === 0 && daysWorked > 0) {
        // Days were marked but no clock times entered. Paying zero would be
        // wrong and silently so.
        notes = 'Marked present on ' + daysWorked + ' day(s) but no hours recorded — enter the hours.';
      }
      break;

    case 'Daily':
      // Paid leave is paid: that is what makes it paid leave.
      gross = money(rate.amount * (daysWorked + daysLeavePaid));
      break;

    case 'Monthly':
      // NOT pro-rated for absence. See the note at the top of this file: the
      // divisor for a day's worth of a month is a policy nobody has set here.
      gross = money(rate.amount);
      if (daysAbsent > 0) {
        notes = daysAbsent + ' absent day(s) — the full monthly rate is shown; adjust it if unpaid.';
      }
      break;

    case 'Per job':
      gross = 0;
      notes = 'Paid per job — attendance cannot work this out. Enter the amount.';
      break;

    default:
      gross = 0;
      notes = 'Unrecognised pay type "' + rate.payType + '" — enter the amount.';
  }

  return {
    employeeId,
    currency: rate.currency,
    payType: rate.payType,
    rateAmount: rate.amount,
    salaryRecordId: rate.id,
    daysWorked, daysLeavePaid, daysAbsent, hoursWorked,
    gross,
    notes,
  };
}

/** Net pay, floored at zero. */
export function netOf(gross: number, advanceDeducted: number, otherDeduction: number): number {
  // Never negative. A deduction bigger than the pay means taking money off
  // somebody, which has to be a deliberate act elsewhere rather than a
  // subtraction that quietly went past zero.
  return money(Math.max(0, gross - advanceDeducted - otherDeduction));
}

/** Run totals, one per currency. Never summed across them. */
export function totalsByCurrency(lines: readonly PayrollLine[]): { currency: string; gross: number; net: number }[] {
  const totals = new Map<string, { gross: number; net: number }>();
  for (const line of lines) {
    const current = totals.get(line.currency) ?? { gross: 0, net: 0 };
    current.gross = money(current.gross + line.gross);
    current.net = money(current.net + line.net);
    totals.set(line.currency, current);
  }
  return [...totals.entries()].map(([currency, t]) => ({ currency, ...t }));
}

export function createPayrollDomain({ db, context }: DomainDeps) {
  function organizationId(): string {
    if (!context.organizationId) {
      throw new PayrollError('This shop is not linked to a business yet, so payroll cannot be run.');
    }
    return context.organizationId;
  }

  async function listRuns(): Promise<PayrollRun[]> {
    requireCapability(context, 'payroll.read', 'see payroll');
    const { data, error } = await db
      .from('payroll_runs')
      .select('*')
      .eq('organization_id', organizationId())
      .order('period_start', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRun);
  }

  async function listLines(runId: string): Promise<PayrollLine[]> {
    requireCapability(context, 'payroll.read', 'see payroll');
    const { data, error } = await db
      .from('payroll_lines')
      .select('*')
      .eq('run_id', runId)
      .order('created_at');
    if (error) throw error;
    return (data ?? []).map(mapLine);
  }

  async function createRun(periodStart: string, periodEnd: string, label = ''): Promise<PayrollRun> {
    requireCapability(context, 'payroll.manage', 'run payroll');
    if (periodEnd < periodStart) {
      throw new PayrollError('The period ends before it starts.');
    }

    const { data, error } = await db
      .from('payroll_runs')
      .insert({
        organization_id: organizationId(),
        period_start: periodStart,
        period_end: periodEnd,
        label,
        status: 'Draft',
        created_by: context.actor.userId ?? null,
      })
      .select()
      .single();
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new PayrollError('A payroll run already covers those dates.');
      }
      throw error;
    }

    const run = mapRun(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.payrollRunCreated,
      entityType: 'payroll_run',
      entityId: run.id,
      after: { periodStart: run.periodStart, periodEnd: run.periodEnd, label: run.label },
    });
    return run;
  }

  /** Replace a draft's lines with freshly calculated ones. */
  async function saveLines(runId: string, lines: readonly Omit<PayrollLine, 'id' | 'runId' | 'organizationId'>[]): Promise<PayrollLine[]> {
    requireCapability(context, 'payroll.manage', 'run payroll');

    const { data: run, error: runError } = await db
      .from('payroll_runs').select('status').eq('id', runId).maybeSingle();
    if (runError) throw runError;
    if (!run) throw new PayrollError('That payroll run no longer exists.');
    if (run.status !== 'Draft') {
      throw new PayrollError('That run is ' + String(run.status).toLowerCase() + ', so its lines cannot be changed.');
    }

    // Replaced wholesale rather than merged: recalculating is the normal way
    // to use a draft, and a partial update would leave lines for people who
    // have since left.
    const { error: clearError } = await db.from('payroll_lines').delete().eq('run_id', runId);
    if (clearError) throw clearError;

    if (lines.length === 0) return [];

    const { data, error } = await db
      .from('payroll_lines')
      .insert(lines.map(line => ({
        run_id: runId,
        organization_id: organizationId(),
        employee_id: line.employeeId,
        currency: line.currency,
        pay_type: line.payType,
        rate_amount: line.rateAmount,
        salary_record_id: line.salaryRecordId,
        days_worked: line.daysWorked,
        days_leave_paid: line.daysLeavePaid,
        days_absent: line.daysAbsent,
        hours_worked: line.hoursWorked,
        gross: line.gross,
        advance_deducted: line.advanceDeducted,
        other_deduction: line.otherDeduction,
        net: netOf(line.gross, line.advanceDeducted, line.otherDeduction),
        notes: line.notes,
      })))
      .select();
    if (error) throw error;
    return (data ?? []).map(mapLine);
  }

  /**
   * Close the run and recover the advances.
   *
   * The database does the work, in one transaction — see
   * finalise_payroll_run. Doing it here would mean a lost connection could
   * leave an advance recovered on the payslip but not in the ledger.
   */
  async function finalise(runId: string): Promise<{ recoveredAdvances: number; totalRecovered: number }> {
    requireCapability(context, 'payroll.manage', 'finalise payroll');

    const { data, error } = await db.rpc('finalise_payroll_run', { p_run_id: runId });
    if (error) throw new PayrollError(error.message);

    const result = Array.isArray(data) ? data[0] : data;
    const recoveredAdvances = Number(result?.recovered_advances ?? 0);
    const totalRecovered = Number(result?.total_recovered ?? 0);

    await writeAuditEvent(db, context, {
      action: AUDIT.payrollRunFinalised,
      entityType: 'payroll_run',
      entityId: runId,
      after: { recoveredAdvances, totalRecovered },
    });

    return { recoveredAdvances, totalRecovered };
  }

  /** Record that the money went out. */
  async function markPaid(runId: string): Promise<PayrollRun> {
    requireCapability(context, 'payroll.manage', 'record payroll as paid');

    const { data, error } = await db
      .from('payroll_runs')
      .update({ status: 'Paid', paid_at: new Date().toISOString() })
      .eq('id', runId)
      .eq('organization_id', organizationId())
      .eq('status', 'Finalised')
      .select()
      .single();
    if (error) throw error;
    if (!data) throw new PayrollError('That run has not been finalised, so it cannot be marked paid.');

    const run = mapRun(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.payrollRunPaid,
      entityType: 'payroll_run',
      entityId: run.id,
      before: { status: 'Finalised' },
      after: { status: 'Paid', paidAt: run.paidAt },
    });
    return run;
  }

  /** Throw away a draft. Only ever a draft. */
  async function deleteDraft(runId: string): Promise<void> {
    requireCapability(context, 'payroll.manage', 'delete a payroll draft');
    const { error } = await db
      .from('payroll_runs')
      .delete()
      .eq('id', runId)
      .eq('organization_id', organizationId())
      .eq('status', 'Draft');
    if (error) throw error;

    await writeAuditEvent(db, context, {
      action: AUDIT.payrollDraftDeleted,
      entityType: 'payroll_run',
      entityId: runId,
    });
  }

  return { listRuns, listLines, createRun, saveLines, finalise, markPaid, deleteDraft };
}
