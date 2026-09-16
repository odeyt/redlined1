/**
 * Automated START gates for the alert and push path (correlation Option A).
 *
 * These add to evaluateStartGates in ./gates.ts. They judge facts read through
 * the service role before a recorded page exists, and record the baselines the
 * checkpoints and finish gates measure against. Pure; the collector is
 * tests/marketing-capture/alert-facts.ts.
 *
 * What the service role cannot see (pg_net's queue, responses and sequences,
 * the invoice sequence, catalog privileges and function definitions) is proven
 * by OWNER START SQL, which the owner runs immediately before the capture.
 */
import { EXPECTED_ALERT_COUNT, RO_WALKTHROUGH_TRANSITIONS, expectedAlertsFor, EXPECTED_ALERTS, type RoAlertModel } from './alertExpectation';
import { DEMO, type GateResult } from './gates';

export interface JobCardSnapshot {
  id: string;
  status: string;
  technicians: string[];
  serviceType: string | null;
  notes: string | null;
  laborHours: number | null;
  partsTotal: number | null;
}

export interface InvoiceSnapshot {
  number: string;
  status: string;
  /** JSON text of the stored lines, compared exactly before and after. */
  linesJson: string;
}

export interface AlertStartFacts {
  demoShopId: string;
  sessionUserId: string | null;
  /** The demo repair order's id, read within the demo shop. */
  repairOrderId: string | null;
  /** Ids of every alert_events row already in the demo shop (a second take starts with some). */
  demoAlertIds: string[] | null;
  /** count(*) of alert_events across ALL shops. */
  allShopAlertCount: number | null;
  /** Ids of every ro_status_events row already in the demo shop. */
  demoStatusEventIds: string[] | null;
  /** audit_events rows in the demo shop for the demo job card. */
  jobCardAuditRows: number | null;
  /** standard_labor_guides in the demo shop: rows and the sum of times_performed. */
  laborGuide: { rows: number; timesPerformed: number } | null;
  /** Demo-shop invoices; the walkthrough must draft none. */
  demoInvoiceCount: number | null;
  invoice: InvoiceSnapshot | null;
  jobCard: JobCardSnapshot | null;
  /** Demo-shop technicians linked to a login. Any linked one could receive job alerts. */
  linkedTechnicians: number | null;
  /**
   * Non-empty phone/email-like values in demo-shop rows, across every table the
   * live schema shows with a shop_id and such a column. null if any table could
   * not be scanned.
   */
  contactValues: { table: string; column: string; count: number }[] | null;
  /** The RO alert model parsed from the repository's trigger source. null if it did not parse. */
  sourceModel: RoAlertModel | null;
  /** Self-test failures from the request ledger, run in the capture's own context. null if it did not run. */
  ledgerSelfTest: string[] | null;
}

export function evaluateAlertStartGates(f: AlertStartFacts): GateResult {
  const failures: string[] = [];

  if (f.sessionUserId === null) failures.push('session user unknown; alert created_by cannot be checked');
  if (f.repairOrderId === null) failures.push(`${DEMO.roNumber} id could not be read in the demo shop`);
  if (f.demoAlertIds === null) failures.push('demo-shop alert baseline could not be read');
  if (f.allShopAlertCount === null) failures.push('all-shop alert count could not be read');
  if (f.demoStatusEventIds === null) failures.push('demo-shop status-event baseline could not be read');
  if (f.jobCardAuditRows === null) failures.push('job-card audit baseline could not be read');
  if (f.laborGuide === null) failures.push('labour-guide baseline could not be read');
  if (f.demoInvoiceCount === null) failures.push('demo-shop invoice count could not be read');

  if (f.invoice === null) failures.push(`${DEMO.invoiceNumber} could not be read in the demo shop`);
  else if (f.invoice.number !== DEMO.invoiceNumber) failures.push(`demo invoice is not ${DEMO.invoiceNumber}`);

  if (f.jobCard === null) failures.push('demo job card snapshot could not be read');

  if (f.linkedTechnicians !== 0) {
    // job.assigned / job.work_added need technicians.user_id; with none linked, neither can fire.
    failures.push(`demo-shop technicians linked to a login must be 0 (found ${f.linkedTechnicians ?? 'unreadable'})`);
  }

  if (f.contactValues === null) failures.push('contact-column scan could not complete');
  else {
    for (const c of f.contactValues.filter(c => c.count !== 0)) {
      failures.push(`demo shop has ${c.count} non-empty ${c.table}.${c.column} value(s)`);
    }
  }

  if (f.sourceModel === null) failures.push('repair-order alert triggers in the repository no longer have the reviewed shape');
  else {
    const derived = expectedAlertsFor(f.sourceModel, RO_WALKTHROUGH_TRANSITIONS, DEMO.roNumber);
    if (derived.length !== EXPECTED_ALERT_COUNT || JSON.stringify(derived) !== JSON.stringify(EXPECTED_ALERTS)) {
      failures.push(`source-derived alerts (${derived.length}) differ from the expectation (${EXPECTED_ALERT_COUNT})`);
    }
  }

  if (f.ledgerSelfTest === null) failures.push('request-ledger self-test did not run');
  else failures.push(...f.ledgerSelfTest.map(s => `request-ledger self-test: ${s}`));

  return { ok: failures.length === 0, failures };
}
