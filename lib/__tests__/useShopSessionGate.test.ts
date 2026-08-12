/**
 * "Not signed in" and "auth hasn't finished loading" are different states.
 *
 * Reported on an Android phone: opening Job Cards showed
 * "Load error: permission denied for table shop_users", which cleared on
 * refresh. The chain:
 *
 *   cold start -> getUser() answers null because the session is not restored
 *   yet -> useShop treats that as signed out and sets loading=false ->
 *   AppShell stops gating and renders the active view -> that view reads a
 *   shopId cached in localStorage and queries immediately -> the request
 *   carries no session, so it runs as `anon` -> 42501, because SELECT on
 *   shop_users is granted to `authenticated` only (policy: shop_users_own,
 *   user_id = auth.uid()).
 *
 * Desktop wins that race virtually every time, which is why nothing caught
 * it here. The fix waits for auth to settle before concluding anything.
 *
 * These assert the source shape — the race needs a real slow cold start to
 * reproduce, which no test in this repo can stage.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const raw = readFileSync(join(__dirname, '..', 'useShop.ts'), 'utf8');
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('useShop waits for auth before deciding there is no user', () => {
  it('does not bail out on the first null from getUser', () => {
    // The regression: `const { data: { user } } = await supabase.auth.getUser();`
    // immediately followed by a bail-out on !user.
    expect(src).not.toMatch(/getUser\(\);\s*if \(!user\) \{ setLoading\(false\); return; \}/);
  });

  it('listens for auth to settle before giving up', () => {
    expect(src).toMatch(/onAuthStateChange/);
    expect(src).toMatch(/resolveUser/);
  });

  it('still resolves for a genuinely signed-out user', () => {
    // INITIAL_SESSION fires once auth settles, and a timeout backstops the
    // case where no event arrives — otherwise a signed-out visitor would sit
    // on a spinner forever.
    expect(src).toMatch(/setTimeout/);
    expect(src).toMatch(/resolve\(null\)/);
  });

  it('unsubscribes so the listener does not leak', () => {
    expect(src).toMatch(/unsubscribe\(\)/);
  });

  it('does not set state after unmount', () => {
    // The wait can outlive the component on a slow connection.
    expect(src).toMatch(/let cancelled = false/);
    expect(src).toMatch(/if \(cancelled\) return/);
    expect(src).toMatch(/return \(\) => \{ cancelled = true; \};/);
  });
});
