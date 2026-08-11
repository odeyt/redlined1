/**
 * PWA foundation — Stage A.
 *
 * The driving problem is not installability, it is staleness. Three bugs this
 * week were investigated at length against browsers running an older bundle
 * than the one deployed: a walkthrough that stopped one item short, a DVI that
 * would not open, an intake that reported success and wrote nothing. Each was
 * already fixed; each tab had simply never been reloaded.
 *
 * A service worker cannot fix that by itself — it governs network handling,
 * not the JavaScript already running in the page — so the work here is to make
 * a new deploy detectable, and to make the running build visible when it is
 * not.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const sw       = read('public/sw.js');
const updater  = read('components/PwaUpdater.tsx');
const layout   = read('app/layout.tsx');
const config   = read('next.config.ts');
const manifest = JSON.parse(read('public/manifest.json'));

describe('the build identifies itself', () => {
  it('the build id is fixed at build time from the deployment', () => {
    expect(config).toMatch(/NEXT_PUBLIC_BUILD_ID: \(process\.env\.VERCEL_GIT_COMMIT_SHA \?\? 'dev'\)\.slice\(0, 7\)/);
  });

  it('the worker is registered under that build', () => {
    // A URL the browser has not seen is always fetched, so a deploy cannot be
    // missed because someone forgot to bump a constant.
    expect(updater).toMatch(/register\(`\/sw\.js\?v=\$\{encodeURIComponent\(BUILD\)\}`\)/);
  });

  it('the cache name derives from it rather than being hand-edited', () => {
    expect(sw).toMatch(/const BUILD = new URL\(self\.location\.href\)\.searchParams\.get\('v'\)/);
    expect(sw).toMatch(/const CACHE_NAME = `redlined1-\$\{BUILD\}`/);
  });

  it('the running build is visible in the UI', () => {
    expect(read('components/Sidebar.tsx')).toMatch(/build \{process\.env\.NEXT_PUBLIC_BUILD_ID/);
  });
});

describe('an update is noticed and offered', () => {
  it('watches for a new worker', () => {
    expect(updater).toMatch(/addEventListener\('updatefound'/);
    expect(updater).toMatch(/incoming\.state === 'installed' && navigator\.serviceWorker\.controller/);
  });

  it('does not prompt on first install', () => {
    // Without the controller check a new user is asked to reload a page they
    // have only just opened.
    expect(updater).toMatch(/Prompting on first install/);
  });

  it('catches an update that landed while the tab was backgrounded', () => {
    expect(updater).toMatch(/if \(reg\.waiting && navigator\.serviceWorker\.controller\) setUpdateReady\(true\)/);
  });

  it('re-checks on focus and on an interval', () => {
    expect(updater).toMatch(/window\.addEventListener\('focus', check\)/);
    expect(updater).toMatch(/setInterval\(check, CHECK_INTERVAL_MS\)/);
  });

  it('asks rather than reloading underneath the user', () => {
    // A technician mid-inspection who is silently navigated away loses what
    // they were typing.
    expect(updater).toMatch(/Reload/);
    expect(updater).toMatch(/Later/);
    expect(updater).not.toMatch(/controllerchange[\s\S]{0,120}location\.reload/);
  });

  it('hands over to the waiting worker before reloading', () => {
    expect(updater).toMatch(/postMessage\(\{ type: 'SKIP_WAITING' \}\)/);
    expect(sw).toMatch(/event\.data\?\.type === 'SKIP_WAITING'/);
  });

  it('a failed registration does not break the app', () => {
    expect(updater).toMatch(/an unregistrable worker must not break the app/);
  });

  it('replaced the old unversioned inline registration', () => {
    expect(layout).not.toMatch(/navigator\.serviceWorker\.register\('\/sw\.js'\)/);
    expect(layout).toMatch(/<PwaUpdater \/>/);
  });
});

describe('nothing private is cached', () => {
  it('API, auth and Supabase bypass the cache', () => {
    expect(sw).toMatch(/url\.pathname\.startsWith\('\/api\/'\)/);
    expect(sw).toMatch(/url\.hostname\.includes\('supabase\.co'\)/);
  });

  it('only this origin is handled', () => {
    expect(sw).toMatch(/if \(url\.origin !== self\.location\.origin\) return;/);
  });

  it('only GET is considered', () => {
    // A POST reaching the Cache API throws.
    expect(sw).toMatch(/if \(request\.method !== 'GET'\) return;/);
  });

  it('only content-hashed build output is ever stored', () => {
    expect(sw).toMatch(/url\.pathname\.startsWith\('\/_next\/static\/'\)/);
    expect(sw).toMatch(/res\.type === 'basic'/);
  });

  it('HTML is never cached, with no offline shell', () => {
    expect(sw).toMatch(/request\.mode === 'navigate'/);
    expect(sw).not.toMatch(/caches\.match\('\/'\)/);
  });

  it('old caches are removed on activate', () => {
    expect(sw).toMatch(/k\.startsWith\('redlined1-'\) && k !== CACHE_NAME/);
  });

  it('a missing asset cannot block installation', () => {
    // addAll rejects wholesale, leaving the app with no worker over one icon.
    expect(sw).toMatch(/cache\.add\(url\)\.catch\(\(\) => null\)/);
    expect(sw).not.toMatch(/cache\.addAll\(/);
  });
});

describe('it is installable on both platforms', () => {
  it('declares the fields an install prompt needs', () => {
    for (const k of ['name', 'short_name', 'start_url', 'display', 'icons', 'id', 'scope']) {
      expect(manifest).toHaveProperty(k);
    }
    expect(manifest.display).toBe('standalone');
  });

  it('separates any from maskable icons', () => {
    // One asset marked "any maskable" gets its edges cropped by Android's
    // adaptive icon mask.
    const any = manifest.icons.filter((i: {purpose: string}) => i.purpose === 'any');
    const mask = manifest.icons.filter((i: {purpose: string}) => i.purpose === 'maskable');
    expect(any.length).toBeGreaterThanOrEqual(2);
    expect(mask.length).toBeGreaterThanOrEqual(2);
  });

  it('ships an Apple touch icon, which iOS uses instead of the manifest', () => {
    expect(() => readFileSync(join(root, 'public/apple-touch-icon.png'))).not.toThrow();
  });

  it('keeps the Apple web-app metadata', () => {
    expect(layout).toMatch(/appleWebApp:/);
    expect(layout).toMatch(/statusBarStyle: 'black-translucent'/);
  });
});

describe('the viewport does not fight the user', () => {
  it('no longer blocks pinch-zoom', () => {
    // maximumScale: 1 fails WCAG 1.4.4 and takes zoom from a technician
    // trying to read a VIN plate in a photo.
    expect(layout).not.toMatch(/maximumScale: 1/);
  });

  it('still covers the notch', () => {
    expect(layout).toMatch(/viewportFit: 'cover'/);
  });
});
