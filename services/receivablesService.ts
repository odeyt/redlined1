/**
 * Compatibility wrapper for the receivables domain.
 *
 * There is no receivables table — this is arithmetic over invoices and
 * payments — so the wrapper exists for consistency with the other services
 * rather than to hide a database call.
 */
import { browserDeps } from '@/lib/domain/browserAdapter';
import {
  createReceivablesDomain, receivablesFrom, agingSummary, byCustomer,
  bucketFor, daysBetween, AGING_BUCKETS,
  type AgingBucket, type Receivable,
} from '@/lib/domain/receivables';

export type { AgingBucket, Receivable };
export { receivablesFrom, agingSummary, byCustomer, bucketFor, daysBetween, AGING_BUCKETS };

/**
 * Every unpaid invoice with what is still owed on it.
 *
 * `today` is accepted so a report can be run "as at" a date rather than always
 * meaning now — and so the result is reproducible when it matters.
 */
export async function fetchReceivables(today?: string): Promise<Receivable[]> {
  return createReceivablesDomain(await browserDeps()).list(today);
}
