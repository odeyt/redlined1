/**
 * No inline style object may set `border` alongside a per-side longhand.
 *
 * ## Why this is a correctness test, not a tidiness one
 *
 * React assigns style keys in object order. So this, which is what two
 * marketing sections actually shipped:
 *
 *   borderLeft: isActive ? `3px solid ${color}` : '3px solid transparent',
 *   border: 'none',
 *   borderBottom: '1px solid …',
 *
 * sets the accent bar and then immediately erases it. Confirmed in a browser
 * by assigning those keys in that order to a real element: computed
 * `border-left` came back `0px none`, against `3px solid` for the
 * longhand-only version.
 *
 * The failure is nastier than "the bar is missing", because it is not
 * missing consistently. On first paint the selected row has no accent. As
 * soon as the selection changes, React diffs the style objects and assigns
 * `borderLeft` ALONE — no `border` in that update to wipe it — so the bar
 * appears and stays. Anyone who clicked before looking saw it working.
 *
 * That same diff is what made React log "Updating a style property during
 * rerender (borderLeft) when a conflicting property is set (border)" on the
 * landing page, several times per interaction.
 *
 * ## Why it scans rather than naming the two files
 *
 * The two known cases are fixed. This is about the next one: the mistake
 * looks completely reasonable in review — `border: 'none'` to kill the button
 * default, a longhand for the accent — and neither typecheck, lint, nor any
 * rendering test would object.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const SEARCH_DIRS = ['app', 'components', 'features', 'lib'];
const SIDES = ['borderLeft', 'borderRight', 'borderTop', 'borderBottom'] as const;

function sourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '__tests__' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Every `style={{ … }}` object in a file, brace-matched and comment-stripped. */
function styleObjects(src: string): Array<{ block: string; line: number }> {
  const found: Array<{ block: string; line: number }> = [];
  let i = 0;
  // Newlines counted as the cursor advances. `src.slice(0, i).split('\n')` per
  // match is quadratic, and VehiclesView alone holds hundreds of style objects
  // in 150KB.
  let line = 1;
  let counted = 0;

  while ((i = src.indexOf('style={{', i)) !== -1) {
    for (; counted < i; counted++) if (src[counted] === '\n') line++;

    let depth = 0, end = -1;
    for (let j = i + 7; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end === -1) break;

    found.push({
      // Comments stripped: the explanation beside a fixed site legitimately
      // names both forms, and flagging that would be the test objecting to
      // its own documentation.
      block: src.slice(i, end)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, ''),
      line,
    });

    // Advance past this object. Without it the same match is found forever —
    // which is exactly what happened, and it exhausted the heap rather than
    // failing, so the first symptom was an OOM and not a test result.
    i = end + 1;
  }
  return found;
}

// `border\s*:` cannot match `borderRadius:` or `borderColor:` — the colon has
// to follow `border` directly.
const SHORTHAND = /(^|[{,\s])border\s*:/;
const sideRe = (s: string) => new RegExp('(^|[{,\\s])' + s + '\\s*:');

/**
 * ORDER is what separates a bug from the ordinary idiom, so only one order is
 * banned.
 *
 *   border: '1px solid grey', borderLeft: '3px solid red'   ← fine, and common
 *   borderLeft: '3px solid red', border: 'none'             ← erases the red
 *
 * The first is how anyone writes "a border all round, except this side". It
 * reads correctly and renders correctly. Twenty-two places in this codebase do
 * it, and a test that flagged them would be objecting to normal CSS — which is
 * exactly what the first version of this test did before the counts were
 * looked at.
 *
 * The second cannot be right under any intent: the longhand is discarded the
 * instant the next key is assigned, so whoever wrote it is describing
 * something the browser never shows.
 */
describe('a border shorthand never follows, and erase, a side longhand', () => {
  const offenders: string[] = [];

  for (const dir of SEARCH_DIRS) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      const src = readFileSync(file, 'utf8');
      if (!src.includes('style={{')) continue;
      for (const { block, line } of styleObjects(src)) {
        if (!SHORTHAND.test(block)) continue;
        const shorthandAt = block.search(SHORTHAND);
        for (const side of SIDES) {
          if (!sideRe(side).test(block)) continue;
          // Only when the shorthand lands AFTER the longhand it destroys.
          if (block.search(sideRe(side)) > shorthandAt) continue;
          const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
          offenders.push(`${rel}:${line} sets \`${side}\` and then erases it with \`border\``);
        }
      }
    }
  }

  it('finds none', () => {
    expect(offenders).toEqual([]);
  });

  it('actually looked at the files', () => {
    // A walker that silently returned nothing would make the check above pass
    // for the worst possible reason.
    const scanned = SEARCH_DIRS.flatMap(d => sourceFiles(join(ROOT, d)));
    expect(scanned.length).toBeGreaterThan(100);
    expect(scanned.some(f => f.endsWith('ServiceAdvisorSection.tsx'))).toBe(true);
  });
});

describe('the two sections that had it keep all four sides as longhands', () => {
  const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

  for (const file of [
    'components/marketing/CustomerIntelligenceSection.tsx',
    'components/marketing/ServiceAdvisorSection.tsx',
  ]) {
    it(`${file} still draws its accent bar`, () => {
      const src = read(file);
      expect(src).toMatch(/borderLeft: .*3px solid/);
      expect(src).toContain("borderRight: 'none', borderTop: 'none',");
    });
  }
});
