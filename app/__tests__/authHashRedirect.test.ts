/**
 * An invited technician must never be stranded on the marketing page.
 *
 * Supabase returns invites and password resets with the session in the URL
 * fragment (#access_token=…&type=invite), destined for /auth/callback. When
 * the redirect target is not in the project's allowed Redirect URLs, Supabase
 * silently falls back to the Site URL — the site root, which for a signed-out
 * visitor is the marketing page.
 *
 * Reported: a technician tapped Accept Invitation, reached redlined1.com and
 * was shown the homepage with no way to set a password. The link had worked;
 * the destination had not been allowed.
 *
 * The login page already forwarded the fragment. The marketing page — the one
 * an invited user is most likely to land on — did not.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const redirect = strip(readFileSync(join(root, 'components', 'AuthHashRedirect.tsx'), 'utf8'));
const landing = readFileSync(join(root, 'app', 'landing-preview', 'page.tsx'), 'utf8');
const login = strip(readFileSync(join(root, 'app', 'login', 'page.tsx'), 'utf8'));

describe('the marketing page rescues an auth fragment', () => {
  it('is mounted there', () => {
    expect(landing).toMatch(/<AuthHashRedirect \/>/);
  });

  it('forwards invite and recovery to the callback', () => {
    expect(redirect).toMatch(/type === 'invite' \|\| type === 'recovery'/);
    expect(redirect).toMatch(/router\.replace\('\/auth\/callback' \+ window\.location\.hash\)/);
  });

  it('requires an access token before redirecting', () => {
    // A bare #type=invite with no token has nothing to exchange.
    expect(redirect).toMatch(/if \(accessToken && \(type === 'invite'/);
  });

  it('forwards Supabase errors too, rather than swallowing them', () => {
    // An expired or reused link arrives as #error=…; leaving it on the
    // marketing page tells the user nothing at all.
    expect(redirect).toMatch(/params\.get\('error'\)/);
  });

  it('leaves any other fragment alone', () => {
    // Anchor links on the marketing page must keep working.
    expect(redirect).toMatch(/if \(!hash\) return;/);
  });

  it('runs in the browser, because a fragment never reaches the server', () => {
    expect(redirect).toMatch(/'use client'/);
    expect(redirect).toMatch(/useEffect/);
  });
});

describe('the login page keeps its own handling', () => {
  it('still forwards the fragment', () => {
    // Both entry points matter: which one a link lands on depends on
    // Supabase configuration we do not control from here.
    expect(login).toMatch(/router\.replace\('\/auth\/callback' \+ window\.location\.hash\)/);
  });
});
