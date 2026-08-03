/**
 * Every AI request must be attributable to a shop.
 *
 * Metering counts AI usage per shop, and a request that cannot be attributed is
 * refused — deliberately, since an uncountable request is the shape abuse
 * takes. But the client never sent a shopId, so the moment the daily limit
 * shipped, every AI request in the product started returning 429: DTC
 * explanations, estimate drafts from inspections, and the Copilot console
 * alike.
 *
 * A regression I introduced. It is guarded on both sides now, because either
 * alone is a single point of failure:
 *
 *   - the client sends the active shop
 *   - the server falls back to the caller's own membership when it does not
 *
 * The server-side fallback reads the CALLER's membership, so it cannot be used
 * to attribute usage to someone else's shop. A shopId the client does send is
 * still verified by isShopMember() before usage is recorded against it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const client = read('services/aiService.ts');
const route  = read('app/api/ai/route.ts');

describe('the client attributes its requests', () => {
  it('sends a shopId with every AI call', () => {
    expect(client).toMatch(/shopId:\s*getShopId\(\)/);
  });

  it('sends it from the active shop store, not a hardcoded or guessed value', () => {
    expect(client).toMatch(/import \{ getShopId \} from '@\/lib\/shopStore'/);
  });

  it('omits the field rather than sending an empty string, so the server fallback runs', () => {
    expect(client).toMatch(/getShopId\(\) \|\| undefined/);
  });
});

describe('the server does not depend on the client getting it right', () => {
  it('falls back to the caller\'s own shop membership', () => {
    expect(route).toMatch(/if \(!resolvedShopId\)/);
    expect(route).toMatch(/from\('shop_users'\)/);
  });

  it('resolves that fallback from the authenticated user, not from the request body', () => {
    const fallback = route.slice(route.indexOf('if (!resolvedShopId)'), route.indexOf('// Get prompt template'));
    expect(fallback).toMatch(/\.eq\('user_id', user\.id\)/);
  });

  it('still verifies a client-supplied shopId before attributing usage to it', () => {
    // isShopMember guards the recording path — a forged shopId must not bill
    // another shop.
    expect(route).toMatch(/isShopMember\(params\.shopId, params\.userId\)/);
  });

  it('checks the quota after the shop is resolved, not before', () => {
    expect(route.indexOf('if (!resolvedShopId)'))
      .toBeLessThan(route.indexOf('checkAiQuota(resolvedShopId)'));
  });
});
