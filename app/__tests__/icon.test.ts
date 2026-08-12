/**
 * Icons must not depend on SVG-namespace innerHTML.
 *
 * Reported: sidebar icons blank on an iPhone, fine in desktop Chrome. This
 * component was the only place in the app setting innerHTML on an <svg>,
 * which requires the content to be parsed into the SVG namespace — the least
 * uniformly supported path across engines. Injecting a full <svg> string into
 * an HTML element instead lets the HTML parser handle the namespace.
 *
 * CONFIRMED on iOS 2026-08-12: the wrapper fixed it on a real iPhone.
 *
 * These tests assert the shape, not the behaviour — nothing here runs in
 * WebKit, so they cannot catch a regression by observing it. They exist
 * because the fix looks like a pointless wrapper and is exactly the kind of
 * thing a later cleanup deletes.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, '..', '..', 'components', 'Icon.tsx'), 'utf8');
const css = readFileSync(join(__dirname, '..', 'globals.css'), 'utf8');

describe('Icon rendering', () => {
  it('does not set innerHTML on an svg element', () => {
    // The regression being guarded: <svg dangerouslySetInnerHTML=...>
    expect(src).not.toMatch(/<svg[^>]*dangerouslySetInnerHTML/);
  });

  it('injects a complete svg element into an HTML host', () => {
    expect(src).toMatch(/<span/);
    expect(src).toMatch(/__html: `<svg class="\$\{className\}"/);
  });

  it('keeps a viewBox so the icon scales to its CSS size', () => {
    expect(src).toMatch(/viewBox="0 0 24 24"/);
  });

  it('falls back to a known icon rather than rendering nothing', () => {
    // An unrecognised name used to render an empty svg; a visible wrong icon
    // beats an invisible gap in a nav.
    expect(src).toMatch(/paths\[name\] \|\| paths\.dashboard/);
  });
});

describe('the styling contract the wrapper must preserve', () => {
  it('still lets colour reach the svg through the wrapper', () => {
    // The span carries `color`; .ui-icon strokes with currentColor.
    expect(src).toMatch(/\.\.\.style/);
    expect(css).toMatch(/\.ui-icon[^}]*stroke:\s*currentColor/);
  });

  it('does not let the wrapper add stray line-height to nav rows', () => {
    expect(src).toMatch(/lineHeight: 0/);
  });

  it('leaves active-state styling matching through the wrapper', () => {
    // Descendant selector, so it survives an extra element in between.
    expect(css).toMatch(/\.nav button\.active \.ui-icon/);
  });
});
