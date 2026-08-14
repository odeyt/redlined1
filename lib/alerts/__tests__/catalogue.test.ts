/**
 * The alert catalogue is the single definition of who hears about what.
 *
 * Settings, live toasts and push all read it, so a switch in settings cannot
 * mean something different from what is delivered.
 *
 * The storage choice these tests protect: preferences hold the DISABLED ids
 * per role, not the enabled ones. Everything is on by default, and an event
 * added later is absent from every stored list — so it is on for every shop
 * without migrating anyone's settings. Storing enabled ids would have made new
 * alerts silently off for existing shops, which is the opposite of the ask.
 */
import {
  ALERT_EVENTS, ALERT_ROLES, eventsForRole, isAlertEnabled, setAlertEnabled,
  type AlertPreferences,
} from '../catalogue';

describe('the catalogue itself', () => {
  it('has no duplicate ids', () => {
    const ids = ALERT_EVENTS.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every event at least one recipient', () => {
    // An event nobody receives is dead weight in settings.
    for (const e of ALERT_EVENTS) expect(e.roles.length).toBeGreaterThan(0);
  });

  it('only names roles the app actually enforces', () => {
    for (const e of ALERT_EVENTS) {
      for (const r of e.roles) expect(ALERT_ROLES).toContain(r);
    }
  });

  it('gives every role something', () => {
    for (const role of ALERT_ROLES) expect(eventsForRole(role).length).toBeGreaterThan(0);
  });

  it('marks which events are actually produced today', () => {
    // A switch for an event nothing emits looks like it works and does
    // nothing. The settings screen labels these, so the distinction has to
    // survive in the data.
    const live = ALERT_EVENTS.filter(e => e.source === 'live').map(e => e.id);
    expect(live).toEqual([
      'ro.status_changed',
      'ro.pending_approval',
      'inspection.completed',
      'estimate.approved',
      'parts.received',
      'invoice.paid',
    ]);
  });

  it('still marks the technician events as not yet sending', () => {
    // Measured 2026-08-13: 25 technicians exist as records, none has a login
    // with the technician role, so nothing could receive these. They stay
    // planned until technicians have accounts and technicians.user_id links
    // them — marking them live would put two working-looking switches in
    // settings that can never fire.
    const planned = ALERT_EVENTS.filter(e => e.source === 'planned').map(e => e.id);
    expect(planned).toEqual(['job.assigned', 'job.work_added']);
  });
});

describe('everything is on by default', () => {
  it('with no stored preferences at all', () => {
    for (const role of ALERT_ROLES) {
      for (const e of eventsForRole(role)) {
        expect(isAlertEnabled(undefined, role, e.id)).toBe(true);
        expect(isAlertEnabled({}, role, e.id)).toBe(true);
      }
    }
  });

  it('for an event added after a shop saved its preferences', () => {
    // The reason disabled ids are stored rather than enabled ones.
    const saved: AlertPreferences = { technician: ['job.assigned'] };
    expect(isAlertEnabled(saved, 'technician', 'job.assigned')).toBe(false);
    expect(isAlertEnabled(saved, 'technician', 'ro.status_changed')).toBe(true);
  });
});

describe('a role never receives what is not theirs', () => {
  it('refuses an event the role is not a recipient of', () => {
    // invoice.paid is owner/manager only.
    expect(isAlertEnabled({}, 'technician', 'invoice.paid')).toBe(false);
  });

  it('ignores a stale stored preference for a foreign event', () => {
    // Deleting the disabled entry must not turn it on for the wrong role.
    const stale: AlertPreferences = { technician: [] };
    expect(isAlertEnabled(stale, 'technician', 'invoice.paid')).toBe(false);
  });

  it('refuses an unknown event id', () => {
    expect(isAlertEnabled({}, 'owner', 'nonsense.event')).toBe(false);
  });
});

describe('toggling', () => {
  it('turning off records the id', () => {
    const next = setAlertEnabled({}, 'technician', 'job.assigned', false);
    expect(next.technician).toEqual(['job.assigned']);
    expect(isAlertEnabled(next, 'technician', 'job.assigned')).toBe(false);
  });

  it('turning back on removes it rather than recording "on"', () => {
    const off = setAlertEnabled({}, 'technician', 'job.assigned', false);
    const on = setAlertEnabled(off, 'technician', 'job.assigned', true);
    expect(on.technician).toEqual([]);
    expect(isAlertEnabled(on, 'technician', 'job.assigned')).toBe(true);
  });

  it('does not disturb other roles', () => {
    const prefs = setAlertEnabled({ owner: ['invoice.paid'] }, 'technician', 'job.assigned', false);
    expect(prefs.owner).toEqual(['invoice.paid']);
  });

  it('does not mutate the input', () => {
    const prefs: AlertPreferences = { technician: [] };
    setAlertEnabled(prefs, 'technician', 'job.assigned', false);
    expect(prefs.technician).toEqual([]);
  });

  it('is idempotent', () => {
    let p = setAlertEnabled({}, 'owner', 'invoice.paid', false);
    p = setAlertEnabled(p, 'owner', 'invoice.paid', false);
    expect(p.owner).toEqual(['invoice.paid']);
  });
});
