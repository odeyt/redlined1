/**
 * A priced row has to be visibly different from an unpriced one — measured,
 * not eyeballed.
 *
 * The colouring shipped with no test, at `rgba(34,197,94,0.09)`. Composited
 * over the dark theme's surface that left a priced row 1.13x from a plain one,
 * and 1.08x on light: below the threshold of noticing, which is exactly what
 * the shop reported. "It looks green in the code" was true and useless.
 *
 * So this asserts the PROPERTY rather than the number. Anyone is free to
 * retune the tint; they are not free to retune it back to invisible, and they
 * cannot buy visibility by making the row's own text harder to read.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(
  join(process.cwd(), 'features/parts/PartsEstimatesView.tsx'), 'utf8');

/** The two themes a row is actually painted on. From app/globals.css. */
const THEMES = [
  { name: 'dark', surface: '#0d0d14', text: '#e8eaf0' },
  { name: 'light', surface: '#ffffff', text: '#111111' },
];

const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const over = (fg: number[], a: number, bg: number[]) =>
  fg.map((c, i) => c * a + bg[i] * (1 - a));

function luminance(rgb: number[]): number {
  const s = rgb.map(v => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
}

function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The tint the quoted row is actually painted with, read from the source. */
function quotedRowTint(): { rgb: number[]; alpha: number } {
  const m = SRC.match(/isQuoted \? \{ background: 'rgba\((\d+),(\d+),(\d+),([\d.]+)\)' \}/);
  if (!m) throw new Error('could not find the quoted-row background in the source');
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: Number(m[4]) };
}

describe('a priced row is distinguishable from an unpriced one', () => {
  const { rgb, alpha } = quotedRowTint();

  for (const theme of THEMES) {
    it(`stands out on the ${theme.name} theme`, () => {
      const surface = hex(theme.surface);
      const tinted = over(rgb, alpha, surface);
      const ratio = contrast(tinted, surface);

      /**
       * 1.2x is the floor, not a target. Below roughly this, a fill reads as
       * the same colour to someone scanning rather than comparing — the state
       * the 0.09 tint was in at 1.13x on dark and 1.08x on light.
       */
      expect(ratio).toBeGreaterThan(1.2);
    });

    it(`keeps the row's own text readable on the ${theme.name} theme`, () => {
      const tinted = over(rgb, alpha, hex(theme.surface));
      const ratio = contrast(hex(theme.text), tinted);

      // WCAG AA for body text. Visibility bought by making the row unreadable
      // is not a fix, and the headroom here is large — there is no reason to
      // spend it.
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('marks the column that survives a sideways scroll', () => {
    /**
     * This table scrolls horizontally, and Unit Cost is off-screen to the
     * right on a phone — which is how the sheet looked in the report. The bar
     * sits on Part Name, the column that stays put, so the signal does not
     * scroll away with the number that caused it.
     */
    expect(SRC).toMatch(/borderLeft: `\d+px solid \$\{isQuoted \? '#22c55e' : 'transparent'\}`/);
    const width = Number(SRC.match(/borderLeft: `(\d+)px solid \$\{isQuoted/)?.[1] ?? 0);
    expect(width).toBeGreaterThanOrEqual(4);
  });

  it('says how many are priced, which colour alone cannot', () => {
    // Colour answers "which rows". With eight rows and a scrolling table,
    // "how many" still needed reading every one.
    expect(SRC).toMatch(/\{priced\} of \{total\} priced/);
  });
});
