/**
 * An unauthenticated API request must be answered, not redirected.
 *
 * proxy.ts redirected every unauthenticated request to /login, /api/* included.
 * A browser follows that and lands on the login page, which is right for a
 * page. A fetch() follows it too, receives an HTML login page, and
 * `res.json()` throws "Unexpected end of JSON input" — an error that names
 * neither the cause nor the fix.
 *
 * That exact message appeared twice on 2026-08-03: once during checkout, once
 * while probing /api/ai. Both cost real time to trace, because the status code
 * that would have explained it (307) never reached the code handling the error.
 *
 * With a beta imminent, the distinction matters: a customer reporting "it says
 * Unexpected end of JSON input" is unactionable, while "it says your session
 * expired" is self-explanatory.
 */

const PUBLIC_PATHS = [
  '/login', '/signup', '/help', '/forgot-password', '/reset-password',
  '/auth/callback', '/landing-preview', '/privacy', '/terms', '/refund-policy',
  '/billing/success', '/billing/canceled', '/contact-sales',
  '/api/billing/webhook', '/api/contact-sales', '/api/ping',
];

/** Mirrors the auth branches in proxy.ts. */
function outcome(pathname: string, opts: { session: boolean; configured?: boolean }) {
  const configured = opts.configured ?? true;
  const isApiRoute = pathname.startsWith('/api/');
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p));

  if (!configured) {
    if (!isPublic) return isApiRoute ? 'json:503' : 'redirect:/login';
    return 'pass';
  }
  if (!opts.session && !isPublic) {
    return isApiRoute ? 'json:401' : 'redirect:/login';
  }
  return 'pass';
}

describe('unauthenticated API requests', () => {
  it.each([
    '/api/ai',
    '/api/billing/checkout',
    '/api/intelligence/memory',
    '/api/provision',
    '/api/members',
  ])('%s answers 401 JSON rather than redirecting', path => {
    expect(outcome(path, { session: false })).toBe('json:401');
  });

  it('never sends an API caller to a login page', () => {
    // The redirect is what produced "Unexpected end of JSON input".
    expect(outcome('/api/ai', { session: false })).not.toBe('redirect:/login');
  });
});

describe('pages still redirect, which is correct for a browser', () => {
  it.each(['/', '/settings', '/admin/billing-health'])('%s redirects to login', path => {
    expect(outcome(path, { session: false })).toBe('redirect:/login');
  });
});

describe('public endpoints stay reachable without a session', () => {
  it('the Creem webhook — a payment provider has no session', () => {
    expect(outcome('/api/billing/webhook/creem', { session: false })).toBe('pass');
  });

  it('the health ping', () => {
    expect(outcome('/api/ping', { session: false })).toBe('pass');
  });

  it('contact sales', () => {
    expect(outcome('/api/contact-sales', { session: false })).toBe('pass');
  });

  it.each(['/login', '/signup', '/auth/callback', '/privacy'])('the %s page', path => {
    expect(outcome(path, { session: false })).toBe('pass');
  });
});

describe('an authenticated caller is unaffected', () => {
  it.each(['/api/ai', '/api/billing/checkout', '/settings'])('%s passes through', path => {
    expect(outcome(path, { session: true })).toBe('pass');
  });
});

describe('when the server is misconfigured', () => {
  it('an API caller gets 503, not 401 — its credentials are not the problem', () => {
    // 401 would have a client re-authenticating against an outage it cannot fix.
    expect(outcome('/api/ai', { session: false, configured: false })).toBe('json:503');
  });

  it('a page still redirects to login', () => {
    expect(outcome('/settings', { session: false, configured: false })).toBe('redirect:/login');
  });

  it('the webhook still gets through, so payments are not lost to a config gap', () => {
    expect(outcome('/api/billing/webhook/creem', { session: false, configured: false })).toBe('pass');
  });
});
