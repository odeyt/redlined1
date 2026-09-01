/**
 * A parts form must be wide enough for the table inside it.
 *
 * Two numbers sit in different parts of a 2000-line file and have to agree:
 * the dialog's `maxWidth` and its table's `minWidth`. Nothing connected them,
 * so they drifted twice:
 *
 *   Parts Orders   dialog 800, table 1040 — 296px short since it was written.
 *                  Every row scrolled sideways on every screen, including a
 *                  1920px monitor with most of it unused.
 *   Quotations     dialog 1160 fitted the old 980 table. Adding the Status and
 *                  Deposit columns took the table to 1210 and pushed it 106px
 *                  over on the same day, in this repo, by me.
 *
 * The second is the point: widening a table is a normal, reasonable edit, and
 * nothing about it suggests you have just broken the dialog around it. So the
 * relationship is asserted rather than the numbers — retune either freely,
 * as long as the table still fits.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const VIEWS = [
  { name: 'Parts Quotations', file: 'features/parts/PartsEstimatesView.tsx' },
  { name: 'Parts Orders', file: 'features/parts/PartsOrdersView.tsx' },
];

/**
 * The dialog holding the parts table, identified by BEING the one that holds
 * it: the last `maxWidth:` declared before the table in source order. Each of
 * these files has several dialogs, and the small ones (vendor, confirm) must
 * not be mistaken for this one.
 */
function formAndTable(src: string) {
  const tableAt = src.search(/<table style=\{\{ width: '100%', minWidth: \d+/);
  if (tableAt === -1) throw new Error('no parts table found');

  const minWidth = Number(src.slice(tableAt).match(/minWidth: (\d+)/)?.[1]);
  const before = src.slice(0, tableAt);
  const widths = [...before.matchAll(/maxWidth: (\d+)[,\s}]/g)];
  const padding = Number(before.match(/padding: (\d+), width: '100%', maxWidth: \d+/)?.[1] ?? 28);

  return {
    maxWidth: Number(widths[widths.length - 1]?.[1]),
    minWidth,
    padding,
  };
}

describe('the parts form is wide enough for its own table', () => {
  for (const view of VIEWS) {
    const src = readFileSync(join(process.cwd(), view.file), 'utf8');
    const { maxWidth, minWidth, padding } = formAndTable(src);

    it(`${view.name}: the table fits without scrolling sideways`, () => {
      // Both numbers must actually have been found, or this test would pass
      // on NaN and guard nothing.
      expect(Number.isFinite(maxWidth)).toBe(true);
      expect(Number.isFinite(minWidth)).toBe(true);

      const usable = maxWidth - padding * 2;
      expect(usable).toBeGreaterThanOrEqual(minWidth);
    });

    it(`${view.name}: still shrinks on a narrow screen`, () => {
      /**
       * maxWidth, not width. A fixed width would fit the table and then
       * overflow the viewport on a laptop, trading a scrolling table for a
       * scrolling page — which is worse, because the page has no visible
       * bound to scroll back from.
       */
      const before = src.slice(0, src.search(/<table style=\{\{ width: '100%', minWidth: \d+/));
      expect(before).toMatch(new RegExp(`width: '100%', maxWidth: ${maxWidth}`));
    });
  }
});
