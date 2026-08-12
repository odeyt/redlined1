/**
 * On a phone the module should get the screen, not the toolbar.
 *
 * Reported: opening Vehicle Intake showed a search box plus New Job Card,
 * Create Invoice and Sign Out — each full width, stacked — before any module
 * content. "Question 1 of 9" sat below the fold on a screen whose whole
 * purpose was answering it.
 *
 * The three actions are hidden below 760px rather than removed: on desktop
 * they sit inline and cost nothing. Sign Out is relocated, not deleted — the
 * nav drawer already carries it at the bottom, which is a better place for a
 * destructive action than directly above the controls a technician taps all
 * day.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const header = readFileSync(join(root, 'components', 'Header.tsx'), 'utf8');
const sidebar = readFileSync(join(root, 'components', 'Sidebar.tsx'), 'utf8');
const css = readFileSync(join(root, 'app', 'globals.css'), 'utf8');

const mobileBlock = css.slice(css.indexOf('@media (max-width: 760px)'));

describe('the three toolbar actions are marked for hiding', () => {
  it.each([
    ['New Job Card', /className="btn topbar-action"[\s\S]{0,120}New Job Card/],
    ['Create Invoice', /className="btn primary topbar-action"[\s\S]{0,120}Create Invoice/],
    ['Sign Out', /className="btn topbar-action"[\s\S]{0,120}Sign Out/],
  ])('%s carries the topbar-action class', (_label, pattern) => {
    expect(header).toMatch(pattern as RegExp);
  });
});

describe('the phone stylesheet hides them', () => {
  it('hides .topbar-action below 760px', () => {
    expect(mobileBlock).toMatch(/\.topbar-action \{[^}]*display:\s*none/);
  });

  it('does not hide them at any width', () => {
    // The rule must live inside the media query, not at the top level, or
    // desktop loses its toolbar too.
    const beforeMedia = css.slice(0, css.indexOf('@media (max-width: 760px)'));
    expect(beforeMedia).not.toMatch(/\.topbar-action \{[^}]*display:\s*none/);
  });

  it('leaves the search in place', () => {
    // Only the three buttons were asked for; search still fills the width.
    expect(mobileBlock).toMatch(/\.search \{[^}]*width:\s*100%/);
  });
});

describe('signing out is still reachable', () => {
  it('the nav drawer carries Sign Out', () => {
    // If this ever goes, hiding the toolbar copy strands mobile users with no
    // way to sign out at all.
    expect(sidebar).toMatch(/Sign Out/);
  });
});
