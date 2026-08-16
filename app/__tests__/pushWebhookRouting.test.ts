/**
 * The push endpoint is called by a machine, so the proxy must let it through.
 *
 * Observed on 2026-08-16: the Supabase database webhook fired correctly and
 * net._http_response recorded 401 "Your session has expired. Reload the page"
 * — which is this proxy's wording, not the route's. The request never reached
 * the handler. A database webhook has no session and never will.
 *
 * Being on the public list does NOT mean unauthenticated. /api/push/send
 * verifies x-push-secret itself, exactly as /api/billing/webhook verifies its
 * provider signature. It means "authenticated differently".
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const proxy = readFileSync(join(root, 'proxy.ts'), 'utf8');
const send = readFileSync(join(root, 'app', 'api', 'push', 'send', 'route.ts'), 'utf8');

describe('the proxy lets the webhook reach the handler', () => {
  it('lists /api/push/send as public', () => {
    expect(proxy).toMatch(/'\/api\/push\/send'/);
  });

  it('does so in BOTH public lists', () => {
    // There are two: one for the missing-env fallback, one for the normal
    // path. Adding it to only one leaves a failure that appears solely when
    // Supabase env vars are absent — the hardest kind to reproduce.
    expect(proxy.match(/'\/api\/push\/send'/g)).toHaveLength(2);
  });

  it('keeps the subscribe endpoint private', () => {
    // That one IS called by a browser with a session, and takes user_id from
    // it. Making it public would let anyone register a device against another
    // person's account.
    expect(proxy).not.toMatch(/'\/api\/push\/subscribe'/);
  });
});

describe('public does not mean open', () => {
  it('the send route still demands the shared secret', () => {
    expect(send).toMatch(/req\.headers\.get\('x-push-secret'\)/);
    expect(send).toMatch(/process\.env\.PUSH_WEBHOOK_SECRET/);
    expect(send).toMatch(/status: 401/);
  });

  it('refuses to run at all when the deployment has no keys', () => {
    expect(send).toMatch(/status: 503/);
  });
});
