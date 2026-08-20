/**
 * The installed app must open on something the user can act on.
 *
 * Reported from an iPhone home-screen install: tapping the icon showed the
 * marketing site with no way to sign in. Cause: start_url was "/", and
 * proxy.ts rewrites "/" to /landing-preview when there is no session. The
 * installed app was pointed at the public website.
 *
 * "/login" is right for BOTH states, which is why it is not simply swapping
 * one wrong door for another:
 *   - signed out -> the sign-in screen, which is what the tap was for
 *   - signed in  -> proxy.ts redirects /login to /, i.e. straight into the app
 *
 * `id` deliberately stays "/". It is the app's stable identity; changing it
 * makes browsers treat this as a different app and orphans existing installs.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const manifest = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'public', 'manifest.json'), 'utf8'),
);
const proxy = readFileSync(join(__dirname, '..', '..', 'proxy.ts'), 'utf8');

describe('manifest start_url', () => {
  it('does not open on the route that renders the marketing page', () => {
    expect(manifest.start_url).not.toBe('/');
    expect(manifest.start_url).toBe('/login');
  });

  it('opens on a route the proxy treats as public', () => {
    // If start_url were not public, a signed-out launch would bounce through
    // a redirect before showing anything.
    // One shared list now; it was two duplicated literals.
    const publicPaths = proxy.match(/const PUBLIC_PATHS = \[([^\]]+)\]/);
    expect(publicPaths).toBeTruthy();
    expect(publicPaths![1]).toContain(`'${manifest.start_url}'`);
  });

  it('keeps start_url inside scope', () => {
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
  });

  it('keeps the app identity stable so existing installs are not orphaned', () => {
    expect(manifest.id).toBe('/');
  });
});

describe('the assumptions this fix rests on', () => {
  it('proxy still rewrites the root to the marketing page when signed out', () => {
    // If this ever stops being true, start_url could go back to "/".
    expect(proxy).toMatch(/if \(!session && isRoot\)/);
    expect(proxy).toMatch(/landing-preview/);
  });

  it('proxy still sends signed-in users from /login into the app', () => {
    // This is what keeps /login correct for someone already authenticated.
    expect(proxy).toMatch(/if \(session && request\.nextUrl\.pathname === '\/login'\)/);
  });
});
