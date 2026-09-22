/**
 * Automated CHECKPOINT and FINISH gates for the alert and push path.
 *
 * Checkpoints run after each repair-order status change, before the next UI
 * action, so the walkthrough is strictly serial: alert k is committed and seen
 * before the change that raises alert k+1 is made. That ordering is what lets
 * OWNER FINISH SQL pair alert k with pg_net request S0+k.
 *
 * The finish gate re-reads everything and produces the ledger token OWNER
 * FINISH SQL checks: the demo shop id, the expected count and the md5 of the
 * ordered alert ids.
 *
 * Pure. The collector is tests/marketing-capture/alert-facts.ts.
 */
import { EXPECTED_ALERTS, EXPECTED_ALERT_COUNT, md5, type ExpectedAlert } from './alertExpectation';
import type { AlertStartFacts, InvoiceSnapshot, JobCardSnapshot } from './alertStartGates';
import { DEMO, type GateResult } from './gates';

export interface AlertRow {
  id: string;
  shopId: string;
  eventType: string;
  targetUserId: string | null;
  targetRole: string | null;
  title: string;
  entityType: string | null;
  entityId: string | null;
  createdBy: string | null;
}

export interface StatusEventRow {
  id: string;
  shopId: string;
  repairOrderId: string;
  oldStatus: string | null;
  newStatus: string;
  changedBy: string | null;
}

/**
 * Read in THIS order by the collector: the all-shop count first, then the demo
 * rows. A demo alert landing between the two reads can then only make the
 * count look short, never long, so a count above the demo rows always means
 * another shop's alert.
 */
export interface AlertProgressFacts {
  allShopAlertCount: number | null;
  /** Demo-shop alerts not in the start baseline, oldest first. */
  newAlerts: AlertRow[] | null;
  /** Demo-shop status events not in the start baseline, oldest first. */
  newStatusEvents: StatusEventRow[] | null;
  pushSubscriptions: number | null;
  sapeleeOutboxRows: number | null;
}

export type CheckpointState = 'waiting' | 'ok' | 'failed';

function alertFailures(start: AlertStartFacts, a: AlertRow, e: ExpectedAlert): string[] {
  const f: string[] = [];
  const at = `alert ${e.k}`;
  if (a.shopId !== start.demoShopId) f.push(`${at}: belongs to another shop`);
  if (a.eventType !== e.eventType) f.push(`${at}: event type ${a.eventType}, expected ${e.eventType}`);
  if (a.title !== e.title) f.push(`${at}: title differs from "${e.title}"`);
  if (a.targetUserId !== null) f.push(`${at}: has a target user`);
  if (a.targetRole !== null) f.push(`${at}: has a target role`);
  if (a.entityType !== 'repair_order' || a.entityId !== start.repairOrderId) f.push(`${at}: is not about ${DEMO.roNumber}`);
  if (a.createdBy !== start.sessionUserId) f.push(`${at}: created by someone other than the demo owner`);
  return f;
}

function statusEventFailures(start: AlertStartFacts, s: StatusEventRow, e: ExpectedAlert): string[] {
  const f: string[] = [];
  const at = `status event ${e.k}`;
  if (s.shopId !== start.demoShopId) f.push(`${at}: belongs to another shop`);
  if (s.repairOrderId !== start.repairOrderId) f.push(`${at}: is not for ${DEMO.roNumber}`);
  if (s.oldStatus !== e.oldStatus || s.newStatus !== e.newStatus) {
    f.push(`${at}: ${s.oldStatus ?? 'null'} → ${s.newStatus}, expected ${e.oldStatus} → ${e.newStatus}`);
  }
  if (s.changedBy !== start.sessionUserId) f.push(`${at}: changed by someone other than the demo owner`);
  return f;
}

/** Failures that apply at every checkpoint and at the finish. */
function progressFailures(start: AlertStartFacts, now: AlertProgressFacts): string[] {
  const f: string[] = [];
  if (now.pushSubscriptions !== 0) f.push(`CRITICAL: a push subscription exists for the demo shop or its member (${now.pushSubscriptions ?? 'unreadable'})`);
  if (now.sapeleeOutboxRows !== 0) f.push(`CRITICAL: Sapelee outbox rows exist for the demo shop (${now.sapeleeOutboxRows ?? 'unreadable'}); do not flush`);
  if (now.newAlerts === null || now.newStatusEvents === null || now.allShopAlertCount === null || start.allShopAlertCount === null) {
    f.push('alert progress could not be read');
    return f;
  }
  const delta = now.allShopAlertCount - start.allShopAlertCount;
  if (delta > now.newAlerts.length) {
    f.push(`UNPROVEN: ${delta - now.newAlerts.length} alert(s) were written in another shop during the take; the window is not exclusive`);
  }
  if (now.newAlerts.length > EXPECTED_ALERT_COUNT) f.push(`${now.newAlerts.length} demo alerts, more than the ${EXPECTED_ALERT_COUNT} expected`);
  now.newAlerts.forEach((a, i) => {
    const e = EXPECTED_ALERTS[i];
    if (e) f.push(...alertFailures(start, a, e));
  });
  now.newStatusEvents.forEach((s, i) => {
    const e = EXPECTED_ALERTS[i];
    if (e) f.push(...statusEventFailures(start, s, e));
    else f.push(`unexpected status event ${i + 1}: ${s.oldStatus ?? 'null'} → ${s.newStatus}`);
  });
  return f;
}

/**
 * After the step that should raise alert `k`. 'waiting' while fewer than k
 * rows are visible and nothing is wrong; 'failed' on anything unexpected,
 * including a row beyond k.
 */
export function evaluateCheckpoint(start: AlertStartFacts, k: number, now: AlertProgressFacts): { state: CheckpointState; failures: string[] } {
  const failures = progressFailures(start, now);
  if (failures.length) return { state: 'failed', failures };
  const alerts = now.newAlerts!.length;
  const events = now.newStatusEvents!.length;
  if (alerts > k || events > k) return { state: 'failed', failures: [`after step ${k}: ${alerts} alert(s) and ${events} status event(s)`] };
  if (alerts < k || events < k) return { state: 'waiting', failures: [] };
  return { state: 'ok', failures: [] };
}

export interface AlertFinishFacts extends AlertProgressFacts {
  jobCard: JobCardSnapshot | null;
  repairOrder: { status: string; invoiceNumber: string | null } | null;
  invoice: InvoiceSnapshot | null;
  demoInvoiceCount: number | null;
  jobCardAuditRows: number | null;
  laborGuide: { rows: number; timesPerformed: number } | null;
  shopMembers: number | null;
}

export function evaluateAlertFinish(start: AlertStartFacts, end: AlertFinishFacts, ledger: readonly string[]): GateResult {
  const failures = progressFailures(start, end);

  if (end.newAlerts && end.newAlerts.length !== EXPECTED_ALERT_COUNT) {
    failures.push(`expected exactly ${EXPECTED_ALERT_COUNT} demo alerts (the source- and live-proven count), found ${end.newAlerts.length}`);
  }
  if (end.newStatusEvents && end.newStatusEvents.length !== EXPECTED_ALERT_COUNT) {
    failures.push(`expected exactly ${EXPECTED_ALERT_COUNT} status events, found ${end.newStatusEvents.length}`);
  }
  if (end.newAlerts && end.allShopAlertCount !== null && start.allShopAlertCount !== null
      && end.allShopAlertCount - start.allShopAlertCount !== end.newAlerts.length) {
    failures.push(`UNPROVEN: all-shop alert delta ${end.allShopAlertCount - start.allShopAlertCount} ≠ demo alerts ${end.newAlerts.length}`);
  }

  if (end.shopMembers !== 1) failures.push('demo shop membership changed during the take');

  const jb = start.jobCard; const ja = end.jobCard;
  if (!jb || !ja) failures.push('job card could not be compared');
  else {
    if (ja.id !== jb.id) failures.push('a different job card was read at the finish');
    if (ja.status !== 'Approved') failures.push(`job card is "${ja.status}", expected "Approved"`);
    if (JSON.stringify(ja.technicians) !== JSON.stringify([DEMO.technician])) failures.push(`job card technicians are not exactly [${DEMO.technician}]`);
    // Unchanged, so job.work_added had nothing to announce.
    for (const k of ['serviceType', 'notes', 'laborHours', 'partsTotal'] as const) {
      if (ja[k] !== jb[k]) failures.push(`job card ${k} changed during the take`);
    }
  }

  if (!end.repairOrder) failures.push('repair order could not be re-read');
  else {
    if (end.repairOrder.status !== 'Complete') failures.push(`repair order is "${end.repairOrder.status}", expected "Complete"`);
    if (end.repairOrder.invoiceNumber !== DEMO.invoiceNumber) failures.push('repair order invoice number changed');
  }

  if (!start.invoice || !end.invoice) failures.push('demo invoice could not be compared');
  else if (JSON.stringify(end.invoice) !== JSON.stringify(start.invoice)) failures.push(`${DEMO.invoiceNumber} changed during the take`);
  if (end.demoInvoiceCount === null || end.demoInvoiceCount !== start.demoInvoiceCount) failures.push('the demo shop gained or lost an invoice');

  if (end.jobCardAuditRows === null || start.jobCardAuditRows === null || end.jobCardAuditRows - start.jobCardAuditRows !== 2) {
    failures.push(`job-card audit rows must grow by exactly 2 (Edit → Save, Approve)`);
  }

  const lb = start.laborGuide; const la = end.laborGuide;
  if (!lb || !la) failures.push('labour guide could not be compared');
  else {
    const inserted = la.rows === lb.rows + 1 && la.timesPerformed === lb.timesPerformed + 1;
    const incremented = la.rows === lb.rows && la.timesPerformed === lb.timesPerformed + 1;
    if (!inserted && !incremented) failures.push('labour guide did not change by exactly one QA sign-off');
  }

  failures.push(...ledger);
  return { ok: failures.length === 0, failures };
}

/** md5 of the ordered alert ids, joined by commas: md5(string_agg(id::text, ',' ORDER BY k)). */
export const orderedAlertIdsMd5 = (ids: readonly string[]) => md5(ids.map(i => i.toLowerCase()).join(','));

/** Appends the 8-character checksum OWNER FINISH SQL verifies, so a mangled paste is refused. */
export const withChecksum = (payload: string) => `${payload};CHK=${md5(payload).slice(0, 8)}`;

/** The token the owner pastes into OWNER FINISH SQL. ASCII only. */
export function ledgerToken(demoShopId: string, alertIds: readonly string[]): string {
  return withChecksum(`RL1L;SHOP=${demoShopId.toLowerCase()};N=${EXPECTED_ALERT_COUNT};MD5=${orderedAlertIdsMd5(alertIds)}`);
}
