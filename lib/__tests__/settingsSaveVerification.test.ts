/**
 * A settings save must confirm it changed something.
 *
 * PostgREST reports no error when an UPDATE matches nothing — RLS filtering
 * every row, a shop id that no longer exists, a stale mirror list. The call
 * returns cleanly, the UI flashes "Saved", and the setting reverts on the next
 * load with nothing to explain why.
 *
 * Observed on 2026-08-03: a shop's default currency was set to THB, the UI
 * reported success, and the database was unchanged.
 *
 * This is the most persistent fault in this codebase. The same shape hid a
 * billing webhook that wrote nothing while answering 200, a shops INSERT that
 * failed for every signup, and writes to a table that did not exist. A write
 * that changed nothing is a failed write.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, '..', '..', 'services', 'shopSettingsService.ts'), 'utf8');

/** Mirrors the post-update check in saveShopSettings. */
function saveOutcome(result: { error: { message: string } | null; count: number | null }) {
  if (result.error) return 'threw:error';
  if (result.count === 0) return 'threw:no-rows';
  return 'saved';
}

describe('save outcomes', () => {
  it('succeeds when a row was updated', () => {
    expect(saveOutcome({ error: null, count: 1 })).toBe('saved');
  });

  it('fails when the database reports an error', () => {
    expect(saveOutcome({ error: { message: 'column does not exist' }, count: null })).toBe('threw:error');
  });

  it('fails when nothing matched, even though no error was reported', () => {
    // The case that actually happened. Silence here is the whole bug.
    expect(saveOutcome({ error: null, count: 0 })).toBe('threw:no-rows');
  });

  it('succeeds across several shops, as a mirrored account saves', () => {
    expect(saveOutcome({ error: null, count: 2 })).toBe('saved');
  });
});

describe('the service asks for the count', () => {
  it('requests an exact count on the settings update', () => {
    // Without { count: 'exact' } the count is null and the check cannot fire.
    expect(src).toMatch(/\.update\(update, \{ count: 'exact' \}\)/);
  });

  it('requests it on the role-permissions update too', () => {
    expect(src).toMatch(/role_permissions: settings\.rolePermissions \}, \{ count: 'exact' \}/);
  });

  it('treats a zero-row settings update as a failure', () => {
    expect(src).toMatch(/if \(count === 0\)[\s\S]{0,200}throw new Error\(\s*\n?\s*'Settings were not saved/);
  });

  it('treats a zero-row permissions update as a failure', () => {
    expect(src).toMatch(/Role permissions were not saved/);
  });

  it('still checks the error as well as the count', () => {
    expect((src.match(/if \(error\) throw error;/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('what the customer is told', () => {
  it('explains what to do rather than naming a row count', () => {
    expect(src).toMatch(/Reload the page and try again/);
  });

  it('does not claim success when nothing was written', () => {
    // The UI flashes "Saved" only when saveShopSettings resolves.
    expect(saveOutcome({ error: null, count: 0 })).not.toBe('saved');
  });
});
