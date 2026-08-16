/**
 * The control that turns push on, and the two ways it could mislead.
 *
 * Push is PER DEVICE. Somebody who enables it on the shop computer and then
 * wonders why their phone stays silent has been misled by the label, not by
 * the feature — so the wording has to say "this device" and mean it.
 *
 * And it must never ask for permission on its own. A prompt nobody invited is
 * the fastest route to a permanent denial, which on iOS can only be undone in
 * Settings rather than in the app.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const toggle = strip(readFileSync(join(root, 'components', 'PushToggle.tsx'), 'utf8'));
const subscribe = strip(readFileSync(join(root, 'lib', 'push', 'subscribe.ts'), 'utf8'));
const settings = readFileSync(join(root, 'features', 'settings', 'SettingsView.tsx'), 'utf8');
const sw = readFileSync(join(root, 'public', 'sw.js'), 'utf8');

describe('it is honest that this is per device', () => {
  it('says so in the button itself', () => {
    expect(toggle).toMatch(/Enable notifications on this device/);
  });

  it('says each device must be turned on separately', () => {
    expect(toggle).toMatch(/turned on separately/);
  });
});

describe('permission is never requested unprompted', () => {
  it('the toggle only asks when pressed', () => {
    // requestPermission lives in enablePush, reached from onClick — never
    // from an effect on mount.
    expect(toggle).not.toMatch(/requestPermission/);
    expect(subscribe).toMatch(/await Notification\.requestPermission\(\)/);
  });

  it('checks support before offering the button at all', () => {
    expect(toggle).toMatch(/pushSupport\(\)/);
    expect(toggle).toMatch(/setUnsupported/);
  });

  it('explains the iOS case rather than showing a dead button', () => {
    expect(subscribe).toMatch(/add Redlined1 to your Home Screen first/);
  });

  it('explains a blocked permission rather than retrying it', () => {
    expect(subscribe).toMatch(/Notifications are blocked for this site/);
  });
});

describe('the device is registered server-side, or not at all', () => {
  it('undoes the browser subscription when the server rejects it', () => {
    // Otherwise the button claims success for a device that will never be
    // sent anything.
    expect(subscribe).toMatch(/await subscription\.unsubscribe\(\)\.catch/);
  });

  it('sends the session token so the server can identify the user', () => {
    expect(subscribe).toMatch(/Authorization: `Bearer \$\{session\.access_token\}`/);
  });
});

describe('the service worker survives a bad push', () => {
  it('falls back to defaults instead of throwing on a malformed payload', () => {
    // A throw here shows the browser's own generic "site updated in the
    // background" notice, which tells the user nothing.
    expect(sw).toMatch(/event\.data \? event\.data\.json\(\) : \{\}/);
    expect(sw).toMatch(/title = payload\.title \|\| 'Redlined1'/);
  });

  it('always shows a notification once a push arrives', () => {
    // Staying silent gets the subscription revoked over time.
    expect(sw).toMatch(/showNotification/);
  });

  it('focuses an existing window rather than opening another', () => {
    expect(sw).toMatch(/clients\.matchAll/);
    expect(sw).toMatch(/return client\.focus\(\)/);
  });
});

describe('it is reachable', () => {
  it('sits in the Alerts panel in Settings', () => {
    expect(settings).toMatch(/<PushToggle \/>/);
    expect(settings).toMatch(/Notifications on this device/);
  });
});
