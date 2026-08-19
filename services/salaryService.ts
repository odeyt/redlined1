/**
 * Compatibility wrapper for the salary domain.
 *
 * Same shape as the other wrappers: build a context from the browser's shop
 * store, delegate. Nothing here touches Supabase directly, so the capability
 * checks and the audit rows cannot be skipped by using the service instead of
 * the domain.
 */
import { browserDeps } from '@/lib/domain/browserAdapter';
import {
  createSalaryDomain, PAY_TYPES, SalaryError, salaryOn, outstandingFrom,
  type AdvanceInput, type AdvanceStatus, type PayType,
  type SalaryAdvance, type SalaryInput, type SalaryRecord,
} from '@/lib/domain/salary';

export type { AdvanceInput, AdvanceStatus, PayType, SalaryAdvance, SalaryInput, SalaryRecord };
export { PAY_TYPES, SalaryError, salaryOn, outstandingFrom };

async function domain() {
  return createSalaryDomain(await browserDeps());
}

/** Every rate ever set for one person, newest first. */
export async function fetchSalaryHistory(employeeId: string): Promise<SalaryRecord[]> {
  return (await domain()).history(employeeId);
}

/** Current rate per person, for everyone the caller may see. */
export async function fetchCurrentSalaries(onDate?: string): Promise<SalaryRecord[]> {
  return (await domain()).currentForAll(onDate);
}

/** Records a new rate from a date. Never edits an existing one. */
export async function setSalary(input: SalaryInput): Promise<SalaryRecord> {
  return (await domain()).setSalary(input);
}

export async function fetchAdvances(
  options: { employeeId?: string; status?: AdvanceStatus } = {},
): Promise<SalaryAdvance[]> {
  return (await domain()).listAdvances(options);
}

export async function requestAdvance(input: AdvanceInput): Promise<SalaryAdvance> {
  return (await domain()).requestAdvance(input);
}

export async function decideAdvance(
  id: string,
  decision: 'Approved' | 'Rejected',
  note = '',
): Promise<SalaryAdvance> {
  return (await domain()).decideAdvance(id, decision, note);
}

/**
 * Records that the money changed hands. Deliberately separate from approval:
 * payroll deducts what was paid, not what was agreed.
 */
export async function markAdvancePaid(id: string, paidOn?: string): Promise<SalaryAdvance> {
  return (await domain()).markAdvancePaid(id, paidOn);
}

/** What is still owed, per currency — never summed across them. */
export async function fetchOutstanding(employeeId?: string): Promise<{ currency: string; amount: number }[]> {
  return (await domain()).outstanding(employeeId);
}
