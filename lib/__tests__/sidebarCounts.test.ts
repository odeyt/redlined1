/**
 * Sidebar badge counts must be real or absent — never invented.
 *
 * navItems carried a hardcoded count per module ('138' customers, '312'
 * vehicles, '486' parts, and 'Pro Trial' on the subscriptions row), and the
 * sidebar fell back to it whenever a module had no loaded count. The visible
 * effects, all reported separately over time:
 *
 *   - a brand-new shop with no records displayed a busy workspace
 *   - the parts badge disagreed with the parts page
 *   - "everything in the sidebar should be zero, it autofills by itself"
 *
 * Each was previously treated as its own bug and patched by wiring up a real
 * count for that one module. The fallback was the shared cause.
 *
 * A badge that is sometimes real and sometimes fictional is worse than none:
 * nothing distinguishes the two, so every number becomes untrustworthy.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { navItems } from '../mock-data';

describe('sidebar badge counts', () => {
  it('no nav item ships a hardcoded count', () => {
    const withCounts = navItems.filter(([, , , count]) => count !== '');
    expect(withCounts.map(([id, , , count]) => `${id}=${count}`)).toEqual([]);
  });

  it('specifically none of the invented figures survive', () => {
    const serialised = JSON.stringify(navItems);
    for (const invented of ['138', '312', '486', '18', 'Pro Trial']) {
      expect(serialised).not.toContain(invented);
    }
  });

  it('the sidebar renders a badge only for counts it actually loaded', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'components', 'Sidebar.tsx'), 'utf8');
    // The old shape passed the hardcoded value in as a fallback argument.
    expect(src).not.toMatch(/getCount\(\s*id\s*,/);
    expect(src).toMatch(/id in realCounts/);
  });

  it('a shop with genuinely zero records still shows zero, not a blank', () => {
    // Mirrors getCount(): presence in realCounts is what decides, not truthiness.
    const realCounts: Record<string, number> = { customers: 0 };
    const getCount = (id: string) => (id in realCounts ? String(realCounts[id]) : '');
    expect(getCount('customers')).toBe('0');
    expect(getCount('vehicles')).toBe('');
  });
});
