/**
 * The version check exists because its absence cost most of a working day.
 *
 * A browser was running pre-M1 JavaScript while the server served the current
 * build. Every theory was reasonable and wrong, because the one fact that
 * settles it — what the page is running versus what the server has — was only
 * recoverable from a network trace.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const SRC = read('components/BuildMarker.tsx');
// Comments explain each rule at length; matching prose would let a test pass
// on its own commentary.
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the version check', () => {
  it('reports the build compiled into THIS bundle, not one fetched at runtime', () => {
    // The whole point: a value fetched from the server describes the server.
    // Only a build-time constant describes the JavaScript that is running.
    expect(CODE).toMatch(/process\.env\.NEXT_PUBLIC_BUILD_ID/);
  });

  it('asks the server uncached', () => {
    // A cached version endpoint reports the build it was cached from, which is
    // the exact failure this exists to detect.
    expect(CODE).toMatch(/fetch\('\/api\/ping', \{ cache: 'no-store' \}\)/);
  });

  it('says plainly when the two disagree', () => {
    expect(CODE).toMatch(/server\.commit !== BUILD/);
    expect(SRC).toMatch(/running an old version/i);
  });

  it('does not cry stale during local development', () => {
    // BUILD is 'dev' with no deployment to compare against.
    expect(CODE).toMatch(/BUILD !== 'dev'/);
  });

  it('unregisters every service worker, not just the active one', () => {
    // An old worker can serve a cached shell that references old chunks AND
    // re-registers itself, so every reload renews the loop. Reloading cannot
    // break it; unregistering can.
    expect(CODE).toMatch(/getRegistrations\(\)/);
    expect(CODE).toMatch(/r\.unregister\(\)/);
  });

  it('clears the caches too', () => {
    expect(CODE).toMatch(/caches\.keys\(\)/);
    expect(CODE).toMatch(/caches\.delete\(k\)/);
  });

  it('reloads even if the clean-up fails', () => {
    // Leaving somebody on a stale build because the tidy-up errored helps
    // nobody.
    const reset = CODE.slice(CODE.indexOf('async function reset'));
    expect(reset).toMatch(/catch \{[\s\S]*?\}\s*window\.location\.reload\(\)/);
  });

  it('offers the escape hatch even when the versions match', () => {
    // "Looks up to date but behaves wrong" is precisely the state that needed
    // it, and in that state the check itself cannot be trusted.
    expect(SRC).toMatch(/Force update/);
  });

  it('is reachable from Settings', () => {
    expect(read('features/settings/SettingsView.tsx')).toMatch(/<BuildMarker \/>/);
  });
});

describe('the build id it depends on', () => {
  it('is fixed at build time from the deployment, not hand-maintained', () => {
    // A hand-bumped version drifts the moment somebody forgets, which is how a
    // stale bundle survives a release.
    expect(read('next.config.ts')).toMatch(/NEXT_PUBLIC_BUILD_ID:[\s\S]*?VERCEL_GIT_COMMIT_SHA/);
  });

  it('is the same value the service worker registers under', () => {
    // One value behind the cache name, the registration URL and what the app
    // reports about itself — otherwise they can disagree.
    expect(read('components/PwaUpdater.tsx')).toMatch(/process\.env\.NEXT_PUBLIC_BUILD_ID/);
    expect(read('components/PwaUpdater.tsx')).toMatch(/sw\.js\?v=\$\{encodeURIComponent\(BUILD\)\}/);
  });

  it('is reported uncached by the server endpoint it is compared against', () => {
    expect(read('app/api/ping/route.ts')).toMatch(/no-store/);
    expect(read('app/api/ping/route.ts')).toMatch(/VERCEL_GIT_COMMIT_SHA/);
  });
});
