/**
 * The sign-in button must stay reachable when a phone keyboard is open.
 *
 * Reported from a real installed PWA: email and password visible, Sign In
 * button not. Nothing in our test suite could have caught it — at 375x812
 * the page measures perfectly, button fully in view, no overflow. The bug
 * only exists once the on-screen keyboard takes half the screen.
 *
 * Mechanism: 100vh does not shrink when the keyboard opens. A card centred
 * in 100vh therefore sits behind the keyboard, and because the content
 * exactly fills the viewport there is no scroll to reach it.
 *
 * Asserting on the stylesheet rather than a rendered layout because no
 * headless viewport reproduces a keyboard. This is a guard against the CSS
 * silently reverting, not a proof the page works — that took a real phone.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(__dirname, '..', 'globals.css'), 'utf8');

const loginPage = (() => {
  const start = css.indexOf('.login-page {');
  return css.slice(start, css.indexOf('}', start));
})();

describe('.login-page survives an open keyboard', () => {
  it('sizes to the dynamic viewport, not the static one', () => {
    expect(loginPage).toMatch(/min-height:\s*100dvh/);
  });

  it('keeps a 100vh fallback for browsers without dvh', () => {
    // Order matters: the fallback must come first so dvh wins where supported.
    expect(loginPage.indexOf('100vh')).toBeLessThan(loginPage.indexOf('100dvh'));
  });

  it('can scroll when the visible area is shorter than the card', () => {
    expect(loginPage).toMatch(/overflow-y:\s*auto/);
  });

  it('does not hard-centre, which is what buried the button', () => {
    // place-items/align-items: center overflows equally in both directions and
    // makes the top of an over-tall card unreachable. `safe` centring aligns
    // to the start instead of overflowing.
    expect(loginPage).not.toMatch(/place-items:\s*center/);
    expect(loginPage).toMatch(/align-content:\s*safe center/);
  });

  it('keeps the card off the screen edges', () => {
    expect(loginPage).toMatch(/padding:\s*\d+px\s+\d+px/);
  });
});
