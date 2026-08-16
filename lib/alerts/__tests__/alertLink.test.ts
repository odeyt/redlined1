/**
 * A notification that opens the app at the last screen someone was on makes
 * them do the work twice: read the alert, then go and find the record. These
 * tests hold the link end to end — the URL push sends, and the parse the shell
 * does when the app opens.
 */
import { alertPath, parseAlertParam, ALERT_ENTITY_MODULE } from '../alertLink';
import { setAlertFocus, consumeAlertFocus, clearAlertFocus } from '../alertFocus';

describe('the link a push notification carries', () => {
  it('points at the record for every entity type the triggers emit', () => {
    // These six strings are written by the alert triggers. A type missing from
    // the map silently degrades to the app's front door, which is the bug
    // this fixes.
    for (const type of ['job_card', 'repair_order', 'invoice', 'inspection', 'estimate', 'parts_order']) {
      expect(ALERT_ENTITY_MODULE[type]).toBeTruthy();
      expect(alertPath(type, 'X-1')).toBe(`/?alert=${encodeURIComponent(`${type}:X-1`)}`);
    }
  });

  it('falls back to the app root rather than a broken link', () => {
    expect(alertPath(null, 'JC-1')).toBe('/');
    expect(alertPath('job_card', null)).toBe('/');
    expect(alertPath('something_new', 'X-1')).toBe('/');
  });

  it('survives an id containing a character that would truncate the URL', () => {
    // Invoice numbers and job card ids are free text in this schema.
    const path = alertPath('invoice', 'INV&0055');
    const value = new URL(path, 'https://example.test').searchParams.get('alert');
    expect(parseAlertParam(value)?.entityId).toBe('INV&0055');
  });
});

describe('reading the link back', () => {
  it('resolves an entity to the module that shows it', () => {
    expect(parseAlertParam('job_card:JC-1786168862456')).toEqual({
      entityType: 'job_card', entityId: 'JC-1786168862456', module: 'job-cards',
    });
  });

  it('keeps an id that itself contains a colon', () => {
    // Only the FIRST colon separates the halves. split(':') would drop the rest.
    expect(parseAlertParam('invoice:INV:0055')?.entityId).toBe('INV:0055');
  });

  it('ignores anything it does not recognise instead of half-applying it', () => {
    for (const bad of [null, undefined, '', 'job_card', 'job_card:', ':JC-1', 'unknown:X-1']) {
      expect(parseAlertParam(bad)).toBeNull();
    }
  });
});

describe('handing the record to the screen that owns it', () => {
  beforeEach(() => clearAlertFocus());

  it('gives the id to the matching entity type', () => {
    setAlertFocus({ entityType: 'job_card', entityId: 'JC-1', module: 'job-cards' });
    expect(consumeAlertFocus('job_card')).toBe('JC-1');
  });

  it('is claimed once, so a re-render does not reopen a closed drawer', () => {
    setAlertFocus({ entityType: 'job_card', entityId: 'JC-1', module: 'job-cards' });
    expect(consumeAlertFocus('job_card')).toBe('JC-1');
    expect(consumeAlertFocus('job_card')).toBeNull();
  });

  it('is not swallowed by a screen it was not meant for', () => {
    setAlertFocus({ entityType: 'invoice', entityId: 'INV-0055', module: 'invoices' });
    expect(consumeAlertFocus('job_card')).toBeNull();
    expect(consumeAlertFocus('invoice')).toBe('INV-0055');
  });

  it('is empty when the app was opened normally', () => {
    expect(consumeAlertFocus('job_card')).toBeNull();
  });
});
