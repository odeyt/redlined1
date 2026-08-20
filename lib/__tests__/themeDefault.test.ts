/**
 * Light is the default, and four places have to agree about it.
 *
 * The theme is decided in more places than is obvious:
 *
 *   1. `:root` in globals.css — paints the very first frame, before any script
 *   2. the inline boot script in layout.tsx — sets data-theme before paint
 *   3. the Sidebar's initial state — decides which label the toggle shows
 *   4. the PWA manifest — the splash screen behind an installed app
 *
 * If (1) and (2) disagree the app flashes the wrong colour on every load. If
 * (2) and (3) disagree the toggle is labelled backwards until someone clicks
 * it. Neither breaks a build or fails any other test, which is why this one
 * exists.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const CSS = read('app/globals.css');
const LAYOUT = read('app/layout.tsx');
const SIDEBAR = read('components/Sidebar.tsx');
const MANIFEST = JSON.parse(read('public/manifest.json'));

/** The value of one custom property inside a given selector block. */
function tokenIn(selector: string, token: string): string | null {
  const start = CSS.indexOf(selector);
  if (start === -1) return null;
  const block = CSS.slice(start, CSS.indexOf('}', start));
  return block.match(new RegExp('--' + token + ':\\s*([^;]+);'))?.[1].trim() ?? null;
}

describe('light is the default', () => {
  it('paints light on the first frame, before any script runs', () => {
    // :root is what the browser uses in the instant before the boot script
    // sets data-theme. A dark :root with a light default means a flash of the
    // wrong theme on every single load.
    expect(tokenIn(':root {', 'bg')).toBe('#f0f0f0');
    expect(tokenIn(':root {', 'text')).toBe('#111111');
  });

  it('matches the light theme block exactly', () => {
    for (const token of ['bg', 'surface', 'text', 'muted', 'card', 'border', 'accent']) {
      expect(tokenIn(':root {', token)).toBe(tokenIn('[data-theme="light"]', token));
    }
  });

  it('keeps the dark theme available and distinct', () => {
    // Opt-in, not removed: anyone who chose dark keeps it.
    expect(tokenIn('[data-theme="dark"]', 'bg')).toBe('#07070a');
  });

  it('opts into dark explicitly at boot, defaulting to light', () => {
    // The shape matters: `if stored === 'dark'` defaults everything else to
    // light. The old `if stored === 'light'` defaulted everything to dark.
    expect(LAYOUT).toMatch(/if \(t === 'dark'\)/);
    expect(LAYOUT).not.toMatch(/if \(t === 'light'\)/);
  });

  it('starts the sidebar toggle in the same state as the boot script', () => {
    // Otherwise the button offers to switch to the theme already showing.
    expect(SIDEBAR).toMatch(/=== 'dark' \? 'dark' : 'light'/);
    expect(SIDEBAR).not.toMatch(/\?\? 'dark'/);
  });

  it('shows a light splash behind the installed app', () => {
    // The PWA splash is the first thing a phone shows, before any CSS loads.
    expect(MANIFEST.background_color).toBe('#f0f0f0');
  });
});
