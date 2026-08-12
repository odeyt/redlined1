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
  it('delegates the filtering to lib/quickActions', () => {
    // The rules — block-list filtering, dedupe, cap, corrupt-storage
    // handling — live there and are tested in lib/__tests__/quickActions.
    // What matters here is that the component does not reimplement them.
    expect(src).toMatch(/from '@\/lib\/quickActions'/);
    expect(src).toMatch(/loadQuickActions\(role\)/);
    expect(src).toMatch(/availableModules\(role\)/);
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

  it('skips an id missing from the nav table rather than rendering a blank tile', () => {
    expect(src).toMatch(/const m = meta\.get\(id\);/);
    expect(src).toMatch(/if \(!m\) return null;/);
  });
});

describe('it stays short and tappable', () => {
  it('caps the row so it cannot become a second sidebar', () => {
    // MAX_QUICK_ACTIONS is enforced in lib/quickActions on both load and
    // save; the component shows the count against it while editing.
    expect(src).toMatch(/MAX_QUICK_ACTIONS/);
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

describe('customisation works on the device it is for', () => {
  const src2 = readFileSync(join(root, 'features', 'dashboard', 'shared', 'RoleQuickActions.tsx'), 'utf8');

  it('offers drag reordering for a mouse', () => {
    expect(src2).toMatch(/draggable=\{editing\}/);
    expect(src2).toMatch(/onDrop=/);
  });

  it('also offers tap controls, because dragstart never fires on touch', () => {
    // A drag-only implementation would work on a desktop and do nothing on
    // the phone this was asked for.
    expect(src2).toMatch(/Move \$\{m\.label\} left/);
    expect(src2).toMatch(/Move \$\{m\.label\} right/);
    expect(src2).toMatch(/Remove \$\{m\.label\}/);
  });

  it('labels the controls for screen readers', () => {
    expect(src2).toMatch(/aria-label=\{`Move/);
    expect(src2).toMatch(/aria-label=\{`Remove/);
  });

  it('persists a change immediately rather than on a separate save', () => {
    // There is no Save button; every edit commits.
    expect(src2).toMatch(/function commit\(next: string\[\]\) \{[\s\S]{0,120}saveQuickActions\(role, next\)/);
  });

  it('offers a way back to the role default', () => {
    expect(src2).toMatch(/resetQuickActions\(role\)/);
  });

  it('does not open a module while editing', () => {
    // Tapping a tile in edit mode must not navigate away mid-customisation.
    expect(src2).toMatch(/if \(!editing\) dispatch\(\{ type: 'SET_MODULE'/);
  });

  it('reads storage in an effect, not during render', () => {
    // localStorage does not exist server-side; reading it in useState's
    // initialiser would make the first client render disagree with the server.
    expect(src2).toMatch(/useEffect\(\(\) => \{[\s\S]{0,160}loadQuickActions\(role\)/);
  });
});
