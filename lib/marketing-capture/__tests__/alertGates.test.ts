/**
 * The automated alert gates: the start baselines, the per-step checkpoints that
 * keep the take serial, and the finish gate that judges what the walkthrough
 * left behind. Each is checked the way it would actually fail.
 */
import { EXPECTED_ALERTS, EXPECTED_ALERT_COUNT, md5 } from '../alertExpectation';
import {
  evaluateAlertFinish, evaluateCheckpoint, ledgerToken, orderedAlertIdsMd5, withChecksum,
  type AlertFinishFacts, type AlertProgressFacts, type AlertRow, type StatusEventRow,
} from '../alertFinishGates';
import { evaluateAlertStartGates, type AlertStartFacts } from '../alertStartGates';
import { DEMO } from '../gates';

const SHOP = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const RO = '33333333-3333-4333-8333-333333333333';
const alertId = (k: number) => `44444444-4444-4444-8444-00000000000${k}`;

const startFacts = (over: Partial<AlertStartFacts> = {}): AlertStartFacts => ({
  demoShopId: SHOP, sessionUserId: USER, repairOrderId: RO,
  demoAlertIds: [], allShopAlertCount: 100, demoStatusEventIds: [],
  jobCardAuditRows: 4, laborGuide: { rows: 1, timesPerformed: 3 }, demoInvoiceCount: 1,
  invoice: { number: DEMO.invoiceNumber, status: 'Draft', linesJson: '[]' },
  jobCard: { id: 'JC-1', status: 'Booked', technicians: [], serviceType: 'Diagnostics', notes: 'x', laborHours: 0, partsTotal: 0 },
  linkedTechnicians: 0, contactValues: [{ table: 'customers', column: 'phone', count: 0 }],
  sourceModel: { statusChangedSkips: ['Pending Approval'], pendingApprovalStatus: 'Pending Approval' },
  ledgerSelfTest: [],
  ...over,
});

const alert = (k: number, over: Partial<AlertRow> = {}): AlertRow => ({
  id: alertId(k), shopId: SHOP, eventType: EXPECTED_ALERTS[k - 1].eventType, targetUserId: null, targetRole: null,
  title: EXPECTED_ALERTS[k - 1].title, entityType: 'repair_order', entityId: RO, createdBy: USER, ...over,
});

const statusEvent = (k: number, over: Partial<StatusEventRow> = {}): StatusEventRow => ({
  id: `55555555-5555-4555-8555-00000000000${k}`, shopId: SHOP, repairOrderId: RO,
  oldStatus: EXPECTED_ALERTS[k - 1].oldStatus, newStatus: EXPECTED_ALERTS[k - 1].newStatus, changedBy: USER, ...over,
});

const progress = (k: number, over: Partial<AlertProgressFacts> = {}): AlertProgressFacts => ({
  allShopAlertCount: 100 + k,
  newAlerts: Array.from({ length: k }, (_, i) => alert(i + 1)),
  newStatusEvents: Array.from({ length: k }, (_, i) => statusEvent(i + 1)),
  pushSubscriptions: 0, sapeleeOutboxRows: 0, ...over,
});

const finishFacts = (over: Partial<AlertFinishFacts> = {}): AlertFinishFacts => ({
  ...progress(EXPECTED_ALERT_COUNT),
  jobCard: { id: 'JC-1', status: 'Approved', technicians: [DEMO.technician], serviceType: 'Diagnostics', notes: 'x', laborHours: 0, partsTotal: 0 },
  repairOrder: { status: 'Complete', invoiceNumber: DEMO.invoiceNumber },
  invoice: { number: DEMO.invoiceNumber, status: 'Draft', linesJson: '[]' },
  demoInvoiceCount: 1, jobCardAuditRows: 6, laborGuide: { rows: 1, timesPerformed: 4 }, shopMembers: 1,
  ...over,
});

describe('start gates', () => {
  it('pass on the prepared demo tenant', () => {
    expect(evaluateAlertStartGates(startFacts())).toEqual({ ok: true, failures: [] });
  });

  it.each([
    ['a technician with a login (job.assigned could fire)', { linkedTechnicians: 1 }, /linked to a login must be 0/],
    ['a contact detail anywhere in the demo shop', { contactValues: [{ table: 'customers', column: 'email', count: 1 }] }, /non-empty customers.email/],
    ['a contact scan that could not complete', { contactValues: null }, /scan could not complete/],
    ['an unreadable alert baseline', { demoAlertIds: null }, /alert baseline could not be read/],
    ['an unreadable all-shop count', { allShopAlertCount: null }, /all-shop alert count/],
    ['a missing repair order', { repairOrderId: null }, /id could not be read/],
    ['an unknown session user', { sessionUserId: null }, /created_by cannot be checked/],
    ['trigger source that no longer parses', { sourceModel: null }, /no longer have the reviewed shape/],
    ['a request-ledger self-test that did not run', { ledgerSelfTest: null }, /self-test did not run/],
    ['a request-ledger self-test failure', { ledgerSelfTest: ['probe 1 was not aborted'] }, /self-test: probe 1/],
    ['a labour-guide baseline that could not be read', { laborGuide: null }, /labour-guide baseline/],
  ])('fail on %s', (_name, over, expected) => {
    const result = evaluateAlertStartGates(startFacts(over as Partial<AlertStartFacts>));
    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(expected);
  });

  it('fail when the source triggers would produce a different count from the expectation', () => {
    const result = evaluateAlertStartGates(startFacts({ sourceModel: { statusChangedSkips: [], pendingApprovalStatus: 'Pending Approval' } }));
    expect(result.failures.join('\n')).toMatch(/source-derived alerts \(6\) differ from the expectation \(5\)/);
  });
});

describe('checkpoints keep the take serial', () => {
  it('waits while the expected alert has not arrived', () => {
    expect(evaluateCheckpoint(startFacts(), 1, progress(0))).toEqual({ state: 'waiting', failures: [] });
  });

  it('passes when exactly k alerts and k status events are visible', () => {
    for (let k = 0; k <= EXPECTED_ALERT_COUNT; k++) {
      expect(evaluateCheckpoint(startFacts(), k, progress(k))).toEqual({ state: 'ok', failures: [] });
    }
  });

  it('fails when an extra alert appears in the demo shop', () => {
    const result = evaluateCheckpoint(startFacts(), 1, progress(2));
    expect(result.state).toBe('failed');
    expect(result.failures.join()).toMatch(/after step 1: 2 alert/);
  });

  it('fails the moment another shop writes an alert: the window is no longer exclusive', () => {
    const result = evaluateCheckpoint(startFacts(), 2, progress(2, { allShopAlertCount: 103 }));
    expect(result.state).toBe('failed');
    expect(result.failures.join()).toMatch(/UNPROVEN: 1 alert\(s\) were written in another shop/);
  });

  it.each([
    ['a push subscription', { pushSubscriptions: 1 }, /CRITICAL: a push subscription exists/],
    ['a Sapelee outbox row', { sapeleeOutboxRows: 1 }, /CRITICAL: Sapelee outbox rows exist.*do not flush/],
    ['an unexpected event type', { newAlerts: [alert(1, { eventType: 'invoice.paid' })] }, /event type invoice.paid/],
    ['an alert addressed to a user', { newAlerts: [alert(1, { targetUserId: USER })] }, /has a target user/],
    ['an alert addressed to a role', { newAlerts: [alert(1, { targetRole: 'owner' })] }, /has a target role/],
    ['an alert belonging to another shop', { newAlerts: [alert(1, { shopId: 'other' })] }, /belongs to another shop/],
    ['an alert about another entity', { newAlerts: [alert(1, { entityId: 'other' })] }, /is not about RO-DEMO-330/],
    ['an alert created by someone else', { newAlerts: [alert(1, { createdBy: 'someone' })] }, /created by someone other than the demo owner/],
    ['a changed title', { newAlerts: [alert(1, { title: 'RO-DEMO-330 has moved' })] }, /title differs/],
    ['a status event for another repair order', { newStatusEvents: [statusEvent(1, { repairOrderId: 'other' })] }, /is not for RO-DEMO-330/],
    ['the wrong transition', { newStatusEvents: [statusEvent(1, { oldStatus: 'Pending Parts' })] }, /Pending Parts . In Progress, expected Open/],
    ['unreadable progress', { newAlerts: null }, /progress could not be read/],
  ])('fails on %s', (_name, over, expected) => {
    const result = evaluateCheckpoint(startFacts(), 1, progress(1, over as Partial<AlertProgressFacts>));
    expect(result.state).toBe('failed');
    expect(result.failures.join('\n')).toMatch(expected);
  });
});

describe('finish gate', () => {
  it('passes on a clean take', () => {
    expect(evaluateAlertFinish(startFacts(), finishFacts(), [])).toEqual({ ok: true, failures: [] });
  });

  it('accepts a labour-guide row inserted or incremented, and nothing else', () => {
    expect(evaluateAlertFinish(startFacts(), finishFacts({ laborGuide: { rows: 2, timesPerformed: 4 } }), []).ok).toBe(true);
    expect(evaluateAlertFinish(startFacts(), finishFacts({ laborGuide: { rows: 1, timesPerformed: 3 } }), []).failures.join())
      .toMatch(/labour guide did not change by exactly one QA sign-off/);
  });

  it.each([
    ['too few alerts', { ...progress(4) }, /expected exactly 5 demo alerts/],
    ['an all-shop delta that does not match', { allShopAlertCount: 110 }, /UNPROVEN: all-shop alert delta/],
    ['a job card left un-approved', { jobCard: { id: 'JC-1', status: 'Booked', technicians: [DEMO.technician], serviceType: 'Diagnostics', notes: 'x', laborHours: 0, partsTotal: 0 } }, /job card is "Booked"/],
    ['a job card whose notes changed (job.work_added could fire)', { jobCard: { id: 'JC-1', status: 'Approved', technicians: [DEMO.technician], serviceType: 'Diagnostics', notes: 'edited', laborHours: 0, partsTotal: 0 } }, /job card notes changed/],
    ['a technician not assigned', { jobCard: { id: 'JC-1', status: 'Approved', technicians: [], serviceType: 'Diagnostics', notes: 'x', laborHours: 0, partsTotal: 0 } }, /technicians are not exactly/],
    ['a repair order not Complete', { repairOrder: { status: 'Pending Approval', invoiceNumber: DEMO.invoiceNumber } }, /expected "Complete"/],
    ['a changed invoice number', { repairOrder: { status: 'Complete', invoiceNumber: 'INV-1042' } }, /invoice number changed/],
    ['a changed demo invoice', { invoice: { number: DEMO.invoiceNumber, status: 'Sent', linesJson: '[]' } }, /INV-DEMO-330 changed/],
    ['an invoice drafted from the shared sequence', { demoInvoiceCount: 2 }, /gained or lost an invoice/],
    ['audit rows that do not match the two job-card updates', { jobCardAuditRows: 5 }, /audit rows must grow by exactly 2/],
    ['membership that changed', { shopMembers: 2 }, /membership changed/],
    ['a subscription that appeared', { pushSubscriptions: 1 }, /CRITICAL: a push subscription/],
    ['a Sapelee outbox row', { sapeleeOutboxRows: 2 }, /CRITICAL: Sapelee outbox/],
  ])('fails on %s', (_name, over, expected) => {
    const result = evaluateAlertFinish(startFacts(), finishFacts(over as Partial<AlertFinishFacts>), []);
    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(expected);
  });

  it('carries the request ledger failures through', () => {
    const result = evaluateAlertFinish(startFacts(), finishFacts(), ['Sentry report attempted: POST o1.ingest.sentry.io/api/1/envelope/ (walkthrough)']);
    expect(result.ok).toBe(false);
    expect(result.failures).toContain('Sentry report attempted: POST o1.ingest.sentry.io/api/1/envelope/ (walkthrough)');
  });
});

describe('the ledger token OWNER FINISH SQL checks', () => {
  const ids = [alertId(1), alertId(2), alertId(3), alertId(4), alertId(5)];

  it('is the demo shop, the expected count and the md5 of the ordered ids', () => {
    expect(ledgerToken(SHOP, ids)).toBe(withChecksum(`RL1L;SHOP=${SHOP};N=5;MD5=${md5(ids.join(','))}`));
  });

  it('is the same md5 the SQL computes: string_agg(id::text, \',\' ORDER BY k)', () => {
    expect(orderedAlertIdsMd5(ids)).toBe(md5(ids.join(',')));
    expect(orderedAlertIdsMd5(ids.map(i => i.toUpperCase()))).toBe(orderedAlertIdsMd5(ids));
  });

  it('changes when the order changes', () => {
    expect(orderedAlertIdsMd5([ids[1], ids[0], ...ids.slice(2)])).not.toBe(orderedAlertIdsMd5(ids));
  });

  it('carries a checksum that a mangled paste breaks', () => {
    const token = ledgerToken(SHOP, ids);
    const payload = token.slice(0, token.indexOf(';CHK='));
    expect(token.endsWith(md5(payload).slice(0, 8))).toBe(true);
    expect(withChecksum(payload.replace('N=5', 'N=6'))).not.toBe(token.replace('N=5', 'N=6'));
  });
});
