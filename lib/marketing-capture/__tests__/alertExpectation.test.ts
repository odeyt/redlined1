/**
 * The expected alerts are DERIVED from the repository's trigger source, not
 * assumed. ownerSql.pgtest.ts proves the same thing by executing those
 * functions; this proves the parser fails closed when they change.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  EXPECTED_ALERTS, EXPECTED_ALERT_COUNT, PINNED_FUNCTIONS, RO_WALKTHROUGH_TRANSITIONS,
  alertsForTransition, expectedAlertsFor, functionBody, normalizedProsrcMd5, prosrcMd5, roAlertModelFromSource,
} from '../alertExpectation';
import { DEMO } from '../gates';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r/g, '');
const source = (name: string) => {
  const entry = PINNED_FUNCTIONS.find(f => f.name === name)!;
  const body = functionBody(read(entry.file), name);
  expect(body).not.toBeNull();
  return body!;
};

const statusChanged = () => source('alert_ro_status_changed');
const pendingApproval = () => source('alert_ro_pending_approval');
const model = () => roAlertModelFromSource(statusChanged(), pendingApproval())!;

describe('the model read from the trigger source', () => {
  it('is the reviewed one: status_changed skips Pending Approval, which has its own alert', () => {
    expect(model()).toEqual({ statusChangedSkips: ['Pending Approval'], pendingApprovalStatus: 'Pending Approval' });
  });

  it('derives exactly EXPECTED_ALERTS for the walkthrough', () => {
    expect(expectedAlertsFor(model(), RO_WALKTHROUGH_TRANSITIONS, DEMO.roNumber)).toEqual(EXPECTED_ALERTS);
    expect(EXPECTED_ALERT_COUNT).toBe(5);
  });

  it('the Pending Approval step raises ro.pending_approval and nothing else', () => {
    const alerts = alertsForTransition(model(), { from: 'In Progress', to: 'Pending Approval' }, DEMO.roNumber);
    expect(alerts.map(a => a.eventType)).toEqual(['ro.pending_approval']);
  });

  it('a status change to anything else raises one ro.status_changed', () => {
    expect(alertsForTransition(model(), { from: 'Open', to: 'In Progress' }, DEMO.roNumber))
      .toEqual([{ eventType: 'ro.status_changed', oldStatus: 'Open', newStatus: 'In Progress', title: 'RO-DEMO-330 → In Progress' }]);
  });

  it('a status set to itself raises nothing', () => {
    expect(alertsForTransition(model(), { from: 'Open', to: 'Open' }, DEMO.roNumber)).toEqual([]);
  });

  it('removing the Pending Approval skip would make the walkthrough raise six alerts', () => {
    const changed = roAlertModelFromSource(statusChanged().replace("IF NEW.status <> 'Pending Approval' THEN", 'IF true THEN'), pendingApproval());
    // The parser no longer recognises the shape, so nothing can silently keep the old count.
    expect(changed).toBeNull();
    const six = expectedAlertsFor({ statusChangedSkips: [], pendingApprovalStatus: 'Pending Approval' }, RO_WALKTHROUGH_TRANSITIONS, DEMO.roNumber);
    expect(six).toHaveLength(6);
    expect(six).not.toEqual(EXPECTED_ALERTS);
  });
});

describe('the parser fails closed', () => {
  it.each([
    ['a second emit in status_changed', () => roAlertModelFromSource(`${statusChanged()}\n PERFORM public.emit_alert_event();`, pendingApproval())],
    ['a direct INSERT INTO alert_events', () => roAlertModelFromSource(statusChanged().replace('PERFORM public.emit_alert_event(', 'INSERT INTO public.alert_events SELECT ('), pendingApproval())],
    ['a changed title', () => roAlertModelFromSource(statusChanged().replace("' → '", "' -> '"), pendingApproval())],
    ['an extra condition', () => roAlertModelFromSource(statusChanged().replace('BEGIN', "BEGIN\n  IF NEW.shop_id IS NULL THEN RETURN NEW; END IF;"), pendingApproval())],
    ['a pending_approval trigger on another status', () => roAlertModelFromSource(statusChanged(), pendingApproval().replace("NEW.status = 'Pending Approval'", "NEW.status = 'Complete'"))],
    ['an empty body', () => roAlertModelFromSource('', '')],
  ])('%s is not the reviewed shape', (_name, parse) => {
    const parsed = parse();
    if (parsed !== null) expect(parsed).not.toEqual({ statusChangedSkips: ['Pending Approval'], pendingApprovalStatus: 'Pending Approval' });
  });

  it('a pending_approval trigger on another status changes the derived alerts', () => {
    const m = roAlertModelFromSource(statusChanged(), pendingApproval().replace("NEW.status = 'Pending Approval'", "NEW.status = 'Complete'"))!;
    expect(expectedAlertsFor(m, RO_WALKTHROUGH_TRANSITIONS, DEMO.roNumber)).not.toEqual(EXPECTED_ALERTS);
  });
});

describe('fingerprints', () => {
  it('functionBody extracts the text PostgreSQL stores, not the whole statement', () => {
    const body = statusChanged();
    expect(body.startsWith('\nBEGIN')).toBe(true);
    expect(body).not.toContain('CREATE OR REPLACE');
    expect(body).not.toContain('$fn$');
  });

  it('every pinned function has exactly one extractable definition in its file', () => {
    for (const f of PINNED_FUNCTIONS) {
      const body = functionBody(read(f.file), f.name);
      expect({ name: f.name, found: body !== null }).toEqual({ name: f.name, found: true });
      expect(prosrcMd5(body!)).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it('the normalised fingerprint ignores whitespace and nothing else', () => {
    const body = statusChanged();
    expect(normalizedProsrcMd5(`  ${body.replace(/\n/g, '\n  ')}  `)).toBe(normalizedProsrcMd5(body));
    expect(prosrcMd5(`  ${body}`)).not.toBe(prosrcMd5(body));
    expect(normalizedProsrcMd5(body.replace('ro.status_changed', 'ro.status_changed2'))).not.toBe(normalizedProsrcMd5(body));
  });

  it('a missing function is null, not a guess', () => {
    expect(functionBody('nothing here', 'alert_ro_status_changed')).toBeNull();
  });
});
