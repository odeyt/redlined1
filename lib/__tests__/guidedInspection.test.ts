/**
 * Walking the DVI checklist instead of scrolling it.
 *
 * The form lists every check at once — on a full template that is sixty-odd
 * rows of four-way radio buttons. A technician working down it on a phone,
 * under a car, loses their place and marks the wrong row.
 *
 * The deeper problem is that every item starts as 'N/A', so a row nobody
 * looked at and a row deliberately marked not-applicable are identical in the
 * data. A customer report cannot tell the difference, and neither can anyone
 * reviewing the inspection.
 *
 * Walking it fixes both: one check fills the screen, and the component tracks
 * what was actually judged this session rather than inferring it from a status
 * that was never blank to begin with.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const guided = read('features/inspections/GuidedInspection.tsx');
const view   = read('features/inspections/InspectionsView.tsx');

describe('it presents one check at a time', () => {
  it('renders a single item from the list', () => {
    expect(guided).toMatch(/const item = items\[idx\];/);
  });

  it('offers all four verdicts', () => {
    for (const v of ['Pass', 'Attention', 'Fail', 'N/A']) {
      expect(guided).toContain(`value: '${v}'`);
    }
  });

  it('names the section, so the inspector knows where they are', () => {
    expect(guided).toMatch(/\{item\.category\} · \{idx \+ 1\} of \{total\}/);
  });

  it('moves both ways', () => {
    expect(guided).toMatch(/setIdx\(i => Math\.max\(0, i - 1\)\)/);
    expect(guided).toMatch(/function next\(\)/);
  });
});

describe('an unchecked item is distinguishable from a deliberate N/A', () => {
  it('tracks what was judged this session', () => {
    // The stored status cannot answer this: every item starts as 'N/A'.
    expect(guided).toMatch(/const \[judged, setJudged\] = useState<Set<string>>\(new Set\(\)\)/);
    expect(guided).toMatch(/setJudged\(prev => new Set\(prev\)\.add\(item\.id\)\)/);
  });

  it('counts progress by items judged, not by position in the list', () => {
    expect(guided).toMatch(/\{judgedCount\} of \{total\} checked/);
    expect(guided).toMatch(/const judgedCount = judged\.size/);
  });

  it('the summary says how many were never checked', () => {
    expect(guided).toMatch(/const unjudged = items\.filter\(i => !judged\.has\(i\.id\)\)/);
    expect(guided).toMatch(/not checked\. They will be reported as N\/A/);
  });

  it('and offers to jump to the first of them', () => {
    expect(guided).toMatch(/go to the first one/);
  });
});

describe('it stops where the work is', () => {
  it('Pass and N/A advance on their own', () => {
    expect(guided).toMatch(/if \(status === 'Pass' \|\| status === 'N\/A'\) setTimeout\(next, 140\)/);
  });

  it('Attention and Fail do not, so notes and a photo can be added', () => {
    // Advancing past a fault is how a DVI ends up flagged with no explanation.
    expect(guided).toMatch(/\(item\.status === 'Attention' \|\| item\.status === 'Fail'\) && judged\.has\(item\.id\)/);
    expect(guided).toMatch(/What did you find\?/);
  });

  it('the summary lists every flagged item and links back to it', () => {
    expect(guided).toMatch(/const flagged = items\.filter\(i => i\.status === 'Attention' \|\| i\.status === 'Fail'\)/);
    expect(guided).toMatch(/setIdx\(items\.findIndex\(i => i\.id === f\.id\)\)/);
  });

  it('sections can be jumped to rather than stepped back through', () => {
    expect(guided).toMatch(/setIdx\(sectionStart\[s\]\)/);
  });
});

describe('it is quick to operate', () => {
  it('has keyboard verdicts and arrow navigation', () => {
    expect(guided).toMatch(/'1': 'Pass', '2': 'Attention', '3': 'Fail', '4': 'N\/A'/);
    expect(guided).toMatch(/e\.key === 'ArrowRight'/);
    expect(guided).toMatch(/e\.key === 'Escape'/);
  });

  it('tells the operator those shortcuts exist', () => {
    expect(guided).toMatch(/Keys: 1 Pass · 2 Attention · 3 Fail · 4 N\/A/);
  });

  it('verdict targets are large enough for a thumb', () => {
    expect(guided).toMatch(/minHeight: 60/);
  });

  it('the verdicts reflow to one row on a wider screen', () => {
    expect(guided).toMatch(/grid-template-columns: repeat\(2, 1fr\)/);
    expect(guided).toMatch(/@media \(min-width: 520px\)/);
  });

  it('notes use a 16px input, so iOS does not zoom', () => {
    expect(guided).toMatch(/fontSize: 16/);
  });

  it('clears the home indicator', () => {
    expect(guided).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  it('honours reduced motion', () => {
    expect(guided).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});

describe('it shares the form\'s state rather than copying it', () => {
  it('every change goes back to the parent', () => {
    // A local copy would drift, and Save would write whichever one it held.
    expect(guided).toMatch(/onChange\(items\.map\(it => \(it\.id === id \? \{ \.\.\.it, \.\.\.changes \} : it\)\)\)/);
    expect(view).toMatch(/onChange=\{items => setForm\(f => \(\{ \.\.\.f, items \}\)\)\}/);
  });

  it('photos go through the existing upload path', () => {
    expect(view).toMatch(/onPhoto=\{itemId => \{ setPhotoTargetItem\(itemId\); photoInputRef\.current\?\.click\(\); \}\}/);
  });

  it('is honest that photos persist immediately and verdicts do not', () => {
    // handlePhotoUpload writes to the database; the verdicts wait for Save.
    expect(guided).toMatch(/Photos upload as you add them\. The verdicts save when you save the inspection\./);
  });

  it('only opens over an open form', () => {
    expect(view).toMatch(/\{guidedOpen && showForm && \(/);
  });

  it('the form checklist stays available', () => {
    // Some inspectors prefer the full list; removing it would take that away.
    expect(view).toMatch(/\{\/\* Checklist \*\/\}/);
    expect(view).toMatch(/▶ Walk through \{form\.items\.length\} checks/);
  });
});
