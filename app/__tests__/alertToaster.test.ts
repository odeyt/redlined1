/**
 * Live toasts, and the two ways they could go wrong.
 *
 * The failure that would kill the feature on day one is toasting the backlog:
 * useNotifications returns up to fifty recent events on first load, so
 * announcing everything it hands over would fire a wall of popups on every
 * page load and train the whole shop to ignore them.
 *
 * The other is silence. Preferences failing to load must not mute alerts —
 * an empty preference object means everything is on, because losing an alert
 * is worse than showing one somebody muted.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const toaster = strip(readFileSync(join(root, 'components', 'AlertToaster.tsx'), 'utf8'));
const shell = readFileSync(join(root, 'components', 'AppShell.tsx'), 'utf8');
const settings = strip(readFileSync(join(root, 'features', 'settings', 'SettingsView.tsx'), 'utf8'));

describe('it never announces the backlog', () => {
  it('treats the first batch as already seen', () => {
    expect(toaster).toMatch(/if \(seen\.current === null\)/);
    expect(toaster).toMatch(/seen\.current = new Set\(notifications\.map\(n => n\.id\)\)/);
  });

  it('distinguishes "not loaded yet" from "no events"', () => {
    // A plain empty Set would make the first real event look like a backlog
    // entry, or the backlog look like news, depending which way it was read.
    expect(toaster).toMatch(/useRef<Set<string> \| null>\(null\)/);
  });

  it('only announces ids it has not seen', () => {
    expect(toaster).toMatch(/notifications\.filter\(n => !seen\.current!\.has\(n\.id\)\)/);
  });

  it('caps a burst rather than firing one toast per row', () => {
    expect(toaster).toMatch(/fresh\.slice\(0, 3\)/);
    expect(toaster).toMatch(/and \$\{fresh\.length - toAnnounce\.length\} more updates/);
  });
});

describe('preferences decide, and failing to read them does not mute', () => {
  it('checks the role preference before announcing', () => {
    expect(toaster).toMatch(/isAlertEnabled\(prefs, role as AlertRole, 'ro\.status_changed'\)/);
  });

  it('falls back to everything-on when settings cannot be read', () => {
    expect(toaster).toMatch(/\.catch\(\(\) => \{ if \(!cancelled\) setPrefs\(\{\}\); \}\)/);
  });

  it('picks up a settings change without a reload', () => {
    expect(toaster).toMatch(/shop-settings-updated/);
    expect(settings).toMatch(/alertPreferences \}/);
  });

  it('says nothing for a role the catalogue does not cover', () => {
    expect(toaster).toMatch(/ALERT_ROLES_SET\.has\(role as AlertRole\)/);
  });
});

describe('mounting is a deliberate decision, not an accident', () => {
  it('is either unmounted with a reason, or mounted with one', () => {
    // Production hit the shell error boundary shortly after this shipped, and
    // AlertToaster was the only addition rendering on every authenticated
    // screen. It is unmounted on main and re-mounted on staging to reproduce
    // the failure.
    //
    // The test accepts both states but demands the comment either way, so the
    // shell can never quietly acquire this component again without somebody
    // writing down why.
    const mounted = /<AlertToaster \/>/.test(shell);
    if (mounted) expect(shell).toMatch(/STAGING ONLY/);
    else expect(shell).toMatch(/intentionally NOT mounted/);
  });
});

describe('the settings screen', () => {
  it('offers a tab per role, owner included', () => {
    expect(settings).toMatch(/ALERT_ROLES\.map\(r =>/);
  });

  it('marks alerts that nothing emits yet', () => {
    // Otherwise the switch looks functional and silently does nothing.
    expect(settings).toMatch(/not sending yet/);
  });

  it('offers a way back to all-on for a role', () => {
    expect(settings).toMatch(/Turn all on for this role/);
  });

  it('saves through the shared settings service', () => {
    expect(settings).toMatch(/saveShopSettings\(\{ alertPreferences \}\)/);
  });
});
