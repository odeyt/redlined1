/**
 * The mobile sidebar must be able to leave the document flow.
 *
 * Reported from Android: the dashboard opened on a tall black band and you had
 * to scroll past it to reach the page; opening the menu showed the whole nav
 * list stacked ABOVE the header rather than sliding over the content.
 *
 * Cause: `<aside className="sidebar" style={{ position: 'relative' }}>`. An
 * inline style outranks every stylesheet rule, so it defeated both layers of
 * the layout at once — `position: sticky` in the base rule on desktop, and
 * `position: fixed` in the max-width:760px block that makes this an
 * off-canvas drawer on a phone. The sidebar stayed in normal flow and the
 * grid stacked it above the main content.
 *
 * The class of bug matters more than this instance: an inline style silently
 * beats a media query, so responsive CSS can be dead on arrival with nothing
 * to show for it in review. That is why this test asserts on the absence of
 * an inline `position`, not on the CSS.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const sidebar = readFileSync(join(root, 'components', 'Sidebar.tsx'), 'utf8');
const css = readFileSync(join(root, 'app', 'globals.css'), 'utf8');

const asideTag = sidebar.match(/<aside[^>]*>/)?.[0] ?? '';

describe('the sidebar root carries no inline position', () => {
  it('renders <aside> without an inline style attribute', () => {
    expect(asideTag).toBeTruthy();
    expect(asideTag).not.toMatch(/style=/);
  });

  it('specifically does not pin position inline', () => {
    expect(asideTag).not.toMatch(/position/);
  });
});

describe('the CSS the inline style was overriding', () => {
  it('still sticks the sidebar on desktop', () => {
    const base = css.match(/\.sidebar \{[^}]*\}/)?.[0] ?? '';
    expect(base).toMatch(/position:\s*sticky/);
  });

  it('still turns it into an off-canvas drawer on a phone', () => {
    // Inside the max-width:760px block: fixed, parked off-screen to the left,
    // and slid in by .mobile-open.
    const mobile = css.slice(css.indexOf('@media (max-width: 760px)'));
    const rule = mobile.match(/\.sidebar \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).toMatch(/left:\s*-\d+px/);
    expect(mobile).toMatch(/\.sidebar\.mobile-open \{[^}]*left:\s*0/);
  });
});
