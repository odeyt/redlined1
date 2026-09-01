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
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Every fixed-width table in the app, not just the two that were reported.
 *
 * A sweep after the Parts Orders report found five tables with a `minWidth`.
 * Three were already fine; the two parts forms were not. Naming those two here
 * would guard the bugs already found and nothing else, and the next table
 * added to a dialog is exactly as likely to overflow it.
 */
function sourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '__tests__' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

interface FixedTable {
  file: string;
  line: number;
  minWidth: number;
  /**
   * The container holding it: the last `maxWidth` declared before the table in
   * source order. These files hold several dialogs and the small ones —
   * vendor, confirm, delete — must not be mistaken for the one the table is
   * in. Null means the table sits on a full-width page, where there is no cap
   * to overflow.
   */
  maxWidth: number | null;
  padding: number;
}

function fixedWidthTables(): FixedTable[] {
  const root = join(__dirname, '..', '..', '..');
  const found: FixedTable[] = [];

  for (const dir of ['app', 'components', 'features']) {
    for (const file of sourceFiles(join(root, dir))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/<table style=\{\{[^}]*?minWidth: (\d+)/g)) {
        const before = src.slice(0, m.index);
        const caps = [...before.matchAll(/maxWidth: (\d{3,})[,\s}]/g)];
        const pad = before.match(/padding: (\d+),[^\n]*maxWidth: \d{3,}/);
        found.push({
          file: file.slice(root.length + 1).split(/[\\/]/).join('/'),
          line: before.split('\n').length,
          minWidth: Number(m[1]),
          maxWidth: caps.length ? Number(caps[caps.length - 1][1]) : null,
          padding: pad ? Number(pad[1]) : 0,
        });
      }
    }
  }
  return found;
}

describe('a fixed-width table fits the container holding it', () => {
  const tables = fixedWidthTables();

  it('actually found the tables', () => {
    // A sweep that silently returned nothing would make every check below
    // pass for the worst possible reason.
    expect(tables.length).toBeGreaterThanOrEqual(5);
    expect(tables.some(t => t.file.endsWith('PartsOrdersView.tsx'))).toBe(true);
    expect(tables.some(t => t.file.endsWith('PartsEstimatesView.tsx'))).toBe(true);
  });

  it('none is wider than the dialog it sits in', () => {
    const tooWide = tables
      .filter(t => t.maxWidth !== null)
      .map(t => ({ ...t, usable: t.maxWidth! - t.padding * 2 }))
      .filter(t => t.usable < t.minWidth)
      .map(t => `${t.file}:${t.line} — table ${t.minWidth} in ${t.usable} usable `
        + `(maxWidth ${t.maxWidth} less ${t.padding * 2} padding), ${t.minWidth - t.usable}px short`);

    expect(tooWide).toEqual([]);
  });

  it('the parts forms shrink on a narrow screen rather than fixing their width', () => {
    /**
     * maxWidth, not width. A fixed width would fit the table and then overflow
     * the viewport on a laptop, trading a scrolling table for a scrolling
     * page — worse, because a page has no visible edge to scroll back from.
     */
    for (const file of [
      'features/parts/PartsEstimatesView.tsx',
      'features/parts/PartsOrdersView.tsx',
    ]) {
      const t = tables.find(x => x.file === file)!;
      const src = readFileSync(join(__dirname, '..', '..', '..', file), 'utf8');
      expect(src).toContain(`width: '100%', maxWidth: ${t.maxWidth}`);
    }
  });
});
