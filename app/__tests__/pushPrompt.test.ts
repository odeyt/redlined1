/**
 * The prompt exists because a toggle buried in Settings reached one person in
 * eleven. What makes it a prompt rather than a nuisance is what it does NOT
 * do, so that is what these tests hold.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(join(process.cwd(), 'components/PushPrompt.tsx'), 'utf8');
// Comments explain these rules at length; asserting against the source with
// comments left in would let a test pass on its own explanation.
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the push prompt', () => {
  it('never asks the browser for permission on render', () => {
    // An unprompted permission dialog is the fastest route to a permanent
    // block, and on iOS a denial can only be undone in system Settings.
    // requestPermission must be reached from a click, inside enablePush.
    expect(CODE).not.toMatch(/requestPermission/);
  });

  it('only calls enablePush from a handler, not an effect', () => {
    const effects = CODE.match(/useEffect\([\s\S]*?\n  \}, \[[^\]]*\]\);/g) ?? [];
    expect(effects.length).toBeGreaterThan(0);
    for (const effect of effects) expect(effect).not.toMatch(/enablePush/);
  });

  it('remembers a dismissal so it cannot come back on the next load', () => {
    expect(CODE).toMatch(/localStorage\.setItem\(DISMISSED_KEY/);
    expect(CODE).toMatch(/localStorage\.getItem\(DISMISSED_KEY\) === 'true'\) return/);
  });

  it('treats turning it on as a dismissal too', () => {
    // A device that later loses its subscription must not start nagging again.
    const turnOn = CODE.slice(CODE.indexOf('async function turnOn'));
    expect(turnOn.slice(0, turnOn.indexOf('}'))).toMatch(/setItem\(DISMISSED_KEY/);
  });

  it('stays silent where push cannot work and nothing can be done about it', () => {
    // The exception is an iPhone in Safari, where installing to the Home
    // Screen is a real fix the person can act on.
    expect(CODE).toMatch(/iPad\|iPhone\|iPod/);
    expect(CODE).toMatch(/if \(!support\.supported\)/);
  });

  it('is mounted in the shell, not only in Settings', () => {
    // The whole point: technicians largely cannot open Settings, which is
    // where the toggle lived while ten of eleven people had no push.
    const shell = readFileSync(join(process.cwd(), 'components/AppShell.tsx'), 'utf8');
    expect(shell).toMatch(/<PushPrompt \/>/);
  });
});

describe('the coverage report', () => {
  const ROUTE = readFileSync(join(process.cwd(), 'app/api/push/coverage/route.ts'), 'utf8');

  it('is restricted to owner and manager', () => {
    // It reports who is on the team and who is reachable, which is not a
    // technician's business.
    expect(ROUTE).toMatch(/requireShopRole\(req, shopId, \['owner', 'manager'\]\)/);
  });

  it('refuses before doing any work', () => {
    const authIndex = ROUTE.indexOf('requireShopRole');
    const queryIndex = ROUTE.indexOf(".from('shop_users')");
    expect(authIndex).toBeGreaterThan(-1);
    expect(queryIndex).toBeGreaterThan(authIndex);
  });
});
