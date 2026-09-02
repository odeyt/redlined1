/**
 * Two columns that looked like safety nets and were not.
 *
 * Found auditing a real payment: Kevin Lewis paid $25.52 for Solo on
 * 2026-08-27, both Creem webhooks processed cleanly, `shop_subscriptions`
 * recorded an active subscription, and his access was correct throughout.
 * Nothing had failed — but two columns were quietly lying.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const LIVE_WEBHOOK = read('app/api/billing/webhook/creem/route.ts');
const PROXY = read('proxy.ts');
const USE_PLAN = read('lib/usePlan.ts');

describe('billing_status tells the truth', () => {
  /**
   * It read 'inactive' for ALL SEVENTEEN profiles — paying customers and
   * internal pro accounts alike — because the only writer was
   * `syncSubscriptionFromProvider`, reached from /api/webhooks/creem: a second
   * Creem route that Creem does not call, that is absent from PUBLIC_PATHS,
   * and that would be answered 401 by the auth proxy if it ever were. Its
   * table holds zero rows.
   *
   * Nothing gates on the column, which is the only reason that was harmless
   * and exactly what made it dangerous: it is a plausible-looking column, and
   * `WHERE billing_status = 'active'` would have locked out the entire estate
   * starting with the owner.
   */
  it('is written by the route Creem actually calls', () => {
    expect(LIVE_WEBHOOK).toMatch(/billing_status: 'active'/);
    expect(LIVE_WEBHOOK).toMatch(/\.update\(\{ plan: planKey, billing_status: 'active' \}/);
  });

  it('is brought back down when a subscription ends', () => {
    // Otherwise the fix replaces "always inactive" with "always active", which
    // is a worse lie because it looks correct.
    expect(LIVE_WEBHOOK).toMatch(/syncBillingStatus\(db, userId, 'cancelled'\)/);
    expect(LIVE_WEBHOOK).toMatch(/syncBillingStatus\(db, userId, 'past_due'\)/);
  });

  it('never demotes plan on a failed payment', () => {
    /**
     * `plan` is what planGate reads to decide access. Demoting it on
     * past_due would take a shop's data away the moment a card bounced,
     * before any dunning and often before a retry succeeds. Losing a month to
     * a lapsed subscriber is a smaller failure than locking a paying shop out
     * of its own job cards.
     */
    const helper = LIVE_WEBHOOK.slice(
      LIVE_WEBHOOK.indexOf('async function syncBillingStatus'),
      LIVE_WEBHOOK.indexOf('async function hmacHex'));
    expect(helper).toContain('billing_status');
    expect(helper).not.toMatch(/plan:/);
  });

  it('does not fail the webhook when the bookkeeping write fails', () => {
    // It runs after the subscription row is written. Throwing would make Creem
    // retry an event whose real effect already landed.
    const helper = LIVE_WEBHOOK.slice(
      LIVE_WEBHOOK.indexOf('async function syncBillingStatus'),
      LIVE_WEBHOOK.indexOf('async function hmacHex'));
    expect(helper).not.toMatch(/throw new Error/);
    expect(helper).toMatch(/console\.error/);
  });

  it('the second Creem route is still the unreachable one', () => {
    /**
     * Recorded rather than fixed. /api/webhooks/creem writes a different table
     * with a different shape, and pointing Creem at it would silently produce
     * a second, divergent billing model. It is unreachable today because the
     * proxy gates it — that is what this asserts, so the day someone adds it
     * to PUBLIC_PATHS this fails and the duplication has to be confronted.
     */
    expect(PROXY).toContain("'/api/billing/webhook'");
    expect(PROXY).not.toContain("'/api/webhooks/creem'");
  });
});

describe('the internal-shop bypass can actually fire', () => {
  /**
   * It read `profiles.shop_id`, which nothing in the codebase writes — null on
   * 16 of 17 rows, including every D1 account — so it had never once run. It
   * looked like a working safety net because those accounts carry plan='pro'
   * and took the ordinary paid path instead.
   */
  it('asks shop_users, not the column nothing populates', () => {
    const block = USE_PLAN.slice(USE_PLAN.indexOf('INTERNAL_SHOP_IDS.has'));
    expect(USE_PLAN).toMatch(/\.from\('shop_users'\)[\s\S]{0,120}\.eq\('user_id', user\.id\)/);
    expect(block).not.toMatch(/data\.shop_id && INTERNAL_SHOP_IDS/);
  });

  it('works for a user who belongs to two shops', () => {
    // Every D1 account does. A single profiles.shop_id could never say so.
    expect(USE_PLAN).toMatch(/memberships \?\? \[\]\)\.some\(/);
  });

  it('costs nothing on the path a paying customer takes', () => {
    // Only consulted when the plan has not already granted pro — which is
    // exactly when the bypass could matter.
    expect(USE_PLAN).toMatch(/if \(s !== 'pro'\) \{/);
  });
});
