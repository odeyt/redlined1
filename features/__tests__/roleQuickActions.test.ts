/**
 * The dashboard's first screenful must be useful to the role looking at it.
 *
 * Reported from a phone: after signing in, the dashboard was a tall black
 * expanse and the user had to scroll to reach anything. The widgets below
 * fetch on mount, so on a slow connection the top of the screen is empty for
 * seconds. RoleQuickActions renders from local data and fills that space with
 * the few things the role actually opens.
 *
 * These are source assertions. The value of the feature is whether the right
 * five or six modules are on screen without scrolling, which needs a device
 * to judge — not something this suite can claim.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const src = readFileSync(join(root, 'features', 'dashboard', 'shared', 'RoleQuickActions.tsx'), 'utf8');
const wrapper = readFileSync(join(root, 'features', 'dashboard', 'DashboardView.tsx'), 'utf8');

// The role block-lists this component must never contradict.
const useShop = readFileSync(join(root, 'lib', 'useShop.ts'), 'utf8');
function blockedFor(constName: string): string[] {
  const m = useShop.match(new RegExp(`${constName}: string\\[\\] = \\[([\\s\\S]*?)\\];`));
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : [];
}
function topFor(role: string): string[] {
  const m = src.match(new RegExp(`${role}:\\s*\\[([^\\]]+)\\]`));
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : [];
}

describe('it appears before anything has loaded', () => {
  it('renders above both dashboard variants', () => {
    // In the wrapper, so neither variant can silently lose it.
    expect(wrapper).toMatch(/<RoleQuickActions \/>/);
    expect(wrapper).toMatch(/personalDashboard \? <NewDashboardView \/> : <LegacyDashboardView \/>/);
  });

  it('does not fetch anything', () => {
    // The whole point is being useful while the widgets are still loading.
    expect(src).not.toMatch(/fetch\(|supabase|await /);
  });
});

describe('it never offers a module the role cannot open', () => {
  it('filters against the role block list at render time', () => {
    expect(src).toMatch(/getBlockedModules\(role\)/);
    expect(src).toMatch(/\.filter\(id => !blocked\.has\(id\)\)/);
  });

  it.each([
    ['technician', 'TECHNICIAN_BLOCKED'],
    ['advisor', 'ADVISOR_BLOCKED'],
    ['manager', 'MANAGER_BLOCKED'],
  ])('the curated %s list contains nothing that role is blocked from', (role, constName) => {
    // The runtime filter is the real guard, but a curated entry that is always
    // filtered out is a mistake worth catching here — it silently shortens the
    // row and nobody notices which tile went missing.
    const blocked = new Set(blockedFor(constName));
    const offenders = topFor(role).filter(id => blocked.has(id));
    expect(offenders).toEqual([]);
  });

  it('only offers modules that exist in the nav table', () => {
    expect(src).toMatch(/\.filter\(id => meta\.has\(id\)\)/);
  });
});

describe('it stays short and tappable', () => {
  it('caps the row so it cannot become a second sidebar', () => {
    expect(src).toMatch(/\.slice\(0, 6\)/);
  });

  it('uses targets well above the 44px minimum', () => {
    // Tapped with gloved or greasy hands in a workshop.
    const m = src.match(/minHeight: (\d+)/);
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(72);
  });

  it('renders nothing rather than guessing before the role is known', () => {
    // Showing an owner's tiles to a technician for a frame is worse than a
    // beat of empty space.
    expect(src).toMatch(/if \(loading \|\| !role\) return null/);
  });
});
