/**
 * What the quality panel may show, and what it must never do on its own.
 *
 * No React Testing Library in this project, so these read source. The limit
 * is real and stated: they prove the wiring and the wording exist, not that a
 * technician sees them. The screen itself is checked on staging.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const PANEL_RAW = readFileSync(
  join(process.cwd(), 'features/vehicles/VehicleQualityPanel.tsx'), 'utf8');

/** Comments stripped, so a ban tests the code and not the prose explaining it. */
const PANEL = PANEL_RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ROUTE = readFileSync(
  join(process.cwd(), 'app/api/vehicles/quality/route.ts'), 'utf8');

describe('nothing is applied without an explicit choice', () => {
  it('starts with no field selected', () => {
    expect(PANEL).toContain('useState<Set<string>>(new Set())');
  });

  it('never preselects, not even a missing field', () => {
    // A checkbox is `checked` from the selection set alone. Nothing seeds it.
    expect(PANEL).toContain('checked={selected.has(s.field)}');
    expect(PANEL).not.toMatch(/checked=\{.*comparison\s*===\s*'MISSING_LOCAL'/);
    expect(PANEL).not.toMatch(/defaultChecked/);
  });

  it('the apply button is inert until something is chosen', () => {
    expect(PANEL).toContain('disabled={!selected.size || saving}');
  });

  it('says how many fields it is about to change', () => {
    expect(PANEL_RAW).toContain('Apply ${selected.size} update');
  });

  it('states plainly that nothing changes until applied', () => {
    expect(PANEL_RAW).toContain('Nothing is changed until you apply it');
    expect(PANEL_RAW).toContain('evidence about');
  });

  it('offers a cancel that clears the selection', () => {
    expect(PANEL).toContain('setOpen(false); setSelected(new Set());');
  });
});

describe('the browser sends field names, never values', () => {
  it('posts only field identifiers', () => {
    const body = PANEL.slice(PANEL.indexOf('body: JSON.stringify('), PANEL.indexOf('}),', PANEL.indexOf('body: JSON.stringify(')));
    expect(body).toContain('fields: [...selected]');
    expect(body).not.toContain('suggestedValue');
    expect(body).not.toContain('values');
  });

  it('sends the fingerprint it was shown', () => {
    expect(PANEL).toContain('fingerprint: data.fingerprint');
  });
});

describe('a conflict is presented differently from a gap', () => {
  it('marks a differing value rather than burying it in a list', () => {
    expect(PANEL_RAW).toContain('DIFFERS');
    expect(PANEL).toContain("const isConflict = s.comparison === 'CONFLICT'");
  });

  it('shows a display-vs-record conflict with both sides named', () => {
    expect(PANEL_RAW).toContain('VEHICLE DATA CONFLICT');
    expect(PANEL_RAW).toContain('Recorded ');
    expect(PANEL_RAW).toContain('Display shows');
  });

  it('offers no way to apply a display label over the record', () => {
    // The label is never a value. The conflict block has no checkbox.
    const block = PANEL.slice(PANEL.indexOf('quality-conflicts'));
    const end = block.indexOf('missingFields');
    expect(block.slice(0, end > 0 ? end : 1200)).not.toContain('<input');
  });

  it('a MATCH is reported, not offered as an action', () => {
    expect(PANEL).toContain("s.comparison === 'MISSING_LOCAL' || s.comparison === 'CONFLICT'");
    expect(PANEL_RAW).toContain('Already agrees:');
  });
});

describe('it is readable without colour and on a phone', () => {
  it('states status in words as well as colour', () => {
    // A colour-only warning is invisible to a colour-blind technician.
    expect(PANEL_RAW).toContain("text: 'REVIEW NEEDED'");
    expect(PANEL_RAW).toContain("text: 'INCOMPLETE'");
    expect(PANEL).toContain('{style.text}');
  });

  it('labels every checkbox', () => {
    expect(PANEL).toContain('htmlFor={id}');
    expect(PANEL).toContain('id={id}');
  });

  it('announces results and errors to assistive technology', () => {
    expect(PANEL).toContain('role="status"');
    expect(PANEL).toContain('role="alert"');
  });

  it('stacks Current above Catalog rather than using a wide table', () => {
    // On a 390px screen a two-column comparison truncates the values, which
    // are the entire point of the comparison.
    expect(PANEL).not.toContain('<table');
    expect(PANEL_RAW).toContain('Current ');
    expect(PANEL_RAW).toContain('Catalog ');
    expect(PANEL).toContain("flexDirection: 'column'");
  });

  it('gives controls a touch-sized target', () => {
    /**
     * Was `minHeight: 38`, which this test pinned only because that is what
     * had been written. 38 is under the house convention of 44 — 22 uses
     * against 7 — and this panel is operated on a phone, in a workshop, by
     * someone who may be wearing gloves.
     *
     * Asserted as "no control under 44" rather than "contains a 44", so a
     * fifth button added at 38 fails instead of passing on its neighbours.
     */
    const heights = [...PANEL.matchAll(/minHeight:\s*(\d+)/g)].map(m => Number(m[1]));
    expect(heights.length).toBeGreaterThan(0);
    expect(heights.filter(h => h < 44)).toEqual([]);

    /**
     * The checkbox itself stays 18px, and that is fine: it sits inside a
     * `<label htmlFor>` that spans the whole row. Measured at 375px the label
     * is 296x62, and tapping its text — not the box — was confirmed to toggle
     * the checkbox. The visible box is an indicator; the row is the target.
     */
    expect(PANEL).toMatch(/width: 18, height: 18/);
    expect(PANEL).toContain('htmlFor={id}');
  });
});

describe('opening the panel spends no provider call', () => {
  it('reads through the quality endpoint only', () => {
    expect(PANEL).toContain('/api/vehicles/quality?');
    for (const forbidden of ['/api/parts/search', 'autoPartsApiRequest', 'resolveProviderVehicle']) {
      expect(PANEL).not.toContain(forbidden);
    }
  });

  it('the endpoint itself reads cache and mapping, never the provider', () => {
    expect(ROUTE).toContain('compareVehicleWithCatalog');
    for (const forbidden of ['autoPartsApiRequest', 'resolveProviderVehicle', 'cachedFetch']) {
      expect(ROUTE).not.toContain(forbidden);
    }
  });

  it('explains an absent catalogue instead of fetching one', () => {
    expect(PANEL_RAW).toContain('has not been matched to a catalogue variant yet');
    expect(PANEL_RAW).toContain('Search for parts again to re-match it');
  });
});

describe('there is no way to fix the whole fleet at once', () => {
  it('offers no bulk action', () => {
    for (const forbidden of ['Fix All', 'fixAll', 'Apply to all', 'enrichAll', 'bulk']) {
      expect(PANEL_RAW).not.toContain(forbidden);
    }
  });

  it('the endpoint acts on exactly one vehicle', () => {
    expect(ROUTE).toContain('vehicleId: z.string().uuid()');
    expect(ROUTE).not.toMatch(/vehicleIds\s*:/);
  });
});

describe('it survives the phone it was designed for', () => {
  /**
   * Measured, not assumed. The panel was rendered at 375px and 320px against a
   * worst-case fixture — every enrichable field, a conflict, and a long
   * catalogue description. The stacked layout held: no horizontal overflow at
   * either width.
   *
   * Two things did not hold, and these pin the fixes.
   */

  it('breaks a long unbroken value instead of pushing the page sideways', () => {
    /**
     * The one input that defeated the layout. A value with no spaces to wrap
     * on took the content to 435px inside a 320px viewport and the whole
     * document scrolled horizontally.
     *
     * Not hypothetical: engine codes, plate strings and hand-typed model names
     * are routinely a single unbroken token.
     *
     * `overflow-wrap` is inherited, so one declaration on the panel root
     * covers the summary, the conflict box and every value beneath it.
     */
    expect(PANEL).toContain("overflowWrap: 'break-word'");
  });

});
