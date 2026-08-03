/**
 * Every route into the app must converge on the user having a shop.
 *
 * Provisioning used to happen in exactly one place — app/auth/callback, the
 * email-confirmation route — and that callback catches provisioning errors so
 * a failure cannot block login. Two consequences, both of which bit:
 *
 *   - any path into the app that skipped the callback left the user shop-less
 *   - a FAILED provision looked identical to a successful one
 *
 * That is how a shops INSERT naming a non-existent column went unnoticed until
 * a customer paid: no signup had ever produced a shop, and nothing said so.
 *
 * The rule now: the callback is one of several convergence points, not the
 * only one, and no provisioning failure is silent.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const callback  = read('app/auth/callback/route.ts');
const provision = read('app/api/provision/route.ts');
const useShop   = read('lib/useShop.ts');
const checkout  = read('app/api/billing/checkout/route.ts');

describe('convergence points', () => {
  it('the auth callback still provisions on confirmed login', () => {
    expect(callback).toMatch(/getOrCreatePrimaryShop/);
  });

  it('a dedicated route can provision on demand', () => {
    expect(provision).toMatch(/getOrCreatePrimaryShop/);
    // ensureFreeSubscription became ensureInitialPlan on 2026-08-03, when a
    // new account started getting a trial rather than the free tier outright.
    expect(provision).toMatch(/ensureInitialPlan/);
  });

  it('the app repairs itself when it finds no membership', () => {
    expect(useShop).toMatch(/\/api\/provision/);
  });

  it('checkout provisions before taking money, as a last resort', () => {
    expect(checkout).toMatch(/getOrCreatePrimaryShop/);
  });
});

describe('failures are visible', () => {
  it('the callback reports instead of only logging', () => {
    expect(callback).toMatch(/alertException\('provisioning'/);
  });

  it('the callback still does not block login — a broken auth flow is worse', () => {
    // The catch must not rethrow or redirect to an error page.
    const block = callback.slice(callback.indexOf('catch (provisionError)'));
    expect(block.slice(0, 600)).not.toMatch(/throw |redirect\(.*auth\/error/);
  });

  it('the provision route reports and answers 500, so a caller knows', () => {
    expect(provision).toMatch(/alertException\('provisioning'/);
    expect(provision).toMatch(/status:\s*500/);
  });

  it('the provision route refuses anonymous callers', () => {
    expect(provision).toMatch(/status:\s*401/);
  });
});

describe('safe to call repeatedly', () => {
  it('relies on getOrCreatePrimaryShop returning an existing shop', () => {
    const svc = read('commercial/onboarding/ShopProvisioningService.ts');
    // The early return on an existing membership is what makes every
    // convergence point above idempotent.
    expect(svc).toMatch(/if \(memberships && memberships\.length > 0\)[\s\S]{0,200}created: false/);
  });

  it('counts ANY membership, not only an owner one', () => {
    const svc = read('commercial/onboarding/ShopProvisioningService.ts');
    // Matching role = 'owner' exclusively meant a manager or technician looked
    // shop-less and had an empty shop created for them, instead of landing in
    // their employer's.
    expect(svc).not.toMatch(/\.eq\('role', 'owner'\)\s*\n\s*\.maybeSingle\(\)/);
  });

  it('useShop only calls it when there is genuinely no membership', () => {
    expect(useShop).toMatch(/if \(!suRows \|\| suRows\.length === 0\)/);
  });
});
