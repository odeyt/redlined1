/**
 * Compatibility wrapper for the payroll domain.
 *
 * Same shape as the other wrappers: build a context from the browser's shop
 * store, delegate. Finalising goes through the database function rather than
 * this layer, because recovering advances has to be all-or-nothing.
 */
import { browserDeps } from '@/lib/domain/browserAdapter';
import {
  createPayrollDomain, calculateLine, netOf, totalsByCurrency, PayrollError,
  type CalculatedLine, type PayrollLine, type PayrollRun, type PayrollStatus,
} from '@/lib/domain/payroll';

export type { CalculatedLine, PayrollLine, PayrollRun, PayrollStatus };
export { calculateLine, netOf, totalsByCurrency, PayrollError };

async function domain() {
  return createPayrollDomain(await browserDeps());
}

export async function fetchPayrollRuns(): Promise<PayrollRun[]> {
  return (await domain()).listRuns();
}

export async function fetchPayrollLines(runId: string): Promise<PayrollLine[]> {
  return (await domain()).listLines(runId);
}

export async function createPayrollRun(periodStart: string, periodEnd: string, label = ''): Promise<PayrollRun> {
  return (await domain()).createRun(periodStart, periodEnd, label);
}

/** Replaces a draft's lines wholesale. Refused once the run is finalised. */
export async function savePayrollLines(
  runId: string,
  lines: readonly Omit<PayrollLine, 'id' | 'runId' | 'organizationId'>[],
): Promise<PayrollLine[]> {
  return (await domain()).saveLines(runId, lines);
}

/**
 * Closes the run and recovers advances, in one database transaction.
 * Returns how many advances were touched and the total taken back.
 */
export async function finalisePayrollRun(runId: string): Promise<{ recoveredAdvances: number; totalRecovered: number }> {
  return (await domain()).finalise(runId);
}

export async function markPayrollPaid(runId: string): Promise<PayrollRun> {
  return (await domain()).markPaid(runId);
}

export async function deletePayrollDraft(runId: string): Promise<void> {
  return (await domain()).deleteDraft(runId);
}
