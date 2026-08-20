/**
 * Every declared event type must actually be emitted somewhere.
 *
 * M12 shipped `DOMAIN_EVENTS` with nine names and four emitters. The other
 * five — invoice.issued, payment.reversed, repair_order.closed,
 * estimate.approved, leave.approved — were declared, exported, documented as
 * "the event types this system emits", and never fired by anything.
 *
 * Nothing failed. The outbox was empty, the relay ran green every five minutes
 * reporting `claimed: 0`, and a subscriber written against invoice.issued
 * would have waited forever with no way to tell the difference between "no
 * invoices were raised" and "this event does not exist".
 *
 * The file's own comment is what makes that a bug rather than a gap: "a list
 * rather than free strings, so a subscriber can be written against something
 * knowable". This test is what keeps that sentence true.
 *
 * Names with no emitter yet belong in PLANNED_DOMAIN_EVENTS, which is exempt.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { DOMAIN_EVENTS, PLANNED_DOMAIN_EVENTS } from '../events';

const DOMAIN_DIR = join(process.cwd(), 'lib', 'domain');

/** Every lib/domain source file, excluding events.ts itself and the tests. */
function domainSources(): string {
  return readdirSync(DOMAIN_DIR)
    .filter(f => f.endsWith('.ts') && f !== 'events.ts')
    .map(f => readFileSync(join(DOMAIN_DIR, f), 'utf8'))
    .join('\n');
}

describe('domain event declarations', () => {
  const sources = domainSources();

  it.each(Object.keys(DOMAIN_EVENTS))('%s is emitted by some domain module', key => {
    // Matching the constant, not the string value, is deliberate: a literal
    // 'invoice.issued' typed by hand somewhere would satisfy a string search
    // while bypassing the very list this test exists to protect.
    expect(sources).toContain('DOMAIN_EVENTS.' + key);
  });

  it('does not declare the same event string twice', () => {
    const values = [
      ...Object.values(DOMAIN_EVENTS),
      ...Object.values(PLANNED_DOMAIN_EVENTS),
    ];
    expect(new Set(values).size).toBe(values.length);
  });

  it('keeps planned events out of the emitted list', () => {
    const emitted = new Set<string>(Object.values(DOMAIN_EVENTS));
    for (const planned of Object.values(PLANNED_DOMAIN_EVENTS)) {
      expect(emitted.has(planned)).toBe(false);
    }
  });

  it('emits nothing that is not declared', () => {
    // The reverse direction: an emitter referencing a key that no longer
    // exists would be a compile error, but one referencing PLANNED_ would not.
    for (const key of Object.keys(PLANNED_DOMAIN_EVENTS)) {
      expect(sources).not.toContain('PLANNED_DOMAIN_EVENTS.' + key);
    }
  });
});
