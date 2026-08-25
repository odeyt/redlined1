/**
 * What the OEM-reference stage is allowed to show, and where selecting one goes.
 *
 * No React Testing Library in this project, so these read source rather than
 * rendered output. The limit is real: they prove the wiring and the wording
 * exist, not that a technician sees them. The screen itself is checked on
 * staging — which is how every bug in this milestone was actually found.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const REFS_RAW = readFileSync(
  join(process.cwd(), 'features/estimates/VehicleOemReferences.tsx'), 'utf8');

/**
 * Source with comments stripped.
 *
 * The bans below are about what the component RENDERS. Applied to the raw
 * file they also flag the prose explaining why those things are absent —
 * which failed the first run of this suite and would have pushed me to delete
 * the explanation to make a test pass. The rule is about code, so the
 * assertion reads code.
 */
const REFS = REFS_RAW
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const MODAL = readFileSync(
  join(process.cwd(), 'features/estimates/PartsSearchModal.tsx'), 'utf8');
const ROUTE = readFileSync(
  join(process.cwd(), 'app/api/parts/search/route.ts'), 'utf8');

describe('the reference stage claims only what it has', () => {
  it('names itself a reference stage, not a parts list', () => {
    expect(REFS_RAW).toContain('VEHICLE PART REFERENCES');
    expect(REFS_RAW).toContain('CATALOG VEHICLE REFERENCE');
  });

  it('offers no purchase action', () => {
    // There is no part yet — no brand, no price, no seller.
    expect(REFS).not.toContain('Select this part');
    expect(REFS).not.toContain('Add to Estimate');
  });

  it('shows no price, brand, image or supplier', () => {
    for (const invented of [
      'itemPrice', 'landedCost', 'shippingCost', 'currency',
      '<img', 'imageUrl', 'supplierName', 'brand',
    ]) {
      expect(REFS).not.toContain(invented);
    }
  });

  it('makes no fitment claim of any kind', () => {
    // Specifically not LIKELY FIT, which the previous build did assert.
    for (const verdict of ['LIKELY', 'VERIFIED', 'fitmentStatus', 'FITMENT_LABEL']) {
      expect(REFS).not.toContain(verdict);
    }
  });

  it('says these are not offers and not yet checked for fitment', () => {
    expect(REFS_RAW).toContain('not offers');
    expect(REFS_RAW).toContain('not yet checked for fitment');
  });
});

describe('a long reference list stays usable', () => {
  it('pages rather than dumping every button', () => {
    // One live query returned 186 references under a single name.
    expect(REFS_RAW).toContain('const PAGE = 25');
    expect(REFS_RAW).toContain('Show more');
  });

  it('offers a client-side filter', () => {
    expect(REFS_RAW).toContain('Search OEM references');
  });

  it('always states what is shown against what exists', () => {
    // "Showing 25" with no denominator reads as the whole answer.
    expect(REFS_RAW).toContain('Showing ${page.length} of ${visible.length}');
    expect(REFS_RAW).toContain('filtered from ');
  });

  it('spends no provider call to filter or page', () => {
    // Everything here is local state over data already delivered.
    expect(REFS).not.toContain('fetch(');
    expect(REFS).not.toContain('runSearch');
    expect(REFS_RAW).toContain('useState');
  });

  it('keys buttons on the reference itself', () => {
    expect(REFS_RAW).toContain('key={oem}');
    expect(REFS).not.toContain('key={i}');
    expect(REFS).not.toContain('key={index}');
  });

  it('gives touch targets a usable height', () => {
    // Mobile is the common case in the workshop.
    expect(REFS_RAW).toMatch(/minHeight: 3[0-9]/);
  });
});

describe('selecting a reference runs the canonical OEM search', () => {
  it('invents no new provider workflow', () => {
    // It reuses runSearch in 'oem' mode — the M-PARTS2A path.
    expect(MODAL).toContain("runSearch(false, { term: oem, mode: 'oem' })");
    expect(MODAL).toContain("setMode('oem')");
  });

  it('routes through the modal, not from inside the reference list', () => {
    // The list raises an intent; the modal owns searching.
    expect(REFS_RAW).toContain('onSelect');
    expect(MODAL).toContain('<VehicleOemReferences');
  });
});

describe('the resolved vehicle survives the switch to OEM mode', () => {
  it('every search sends the vehicle context', () => {
    // runSearch builds one body for all modes, so switching to 'oem' cannot
    // drop the vehicle — which is what keeps applicability evaluable.
    const start = MODAL.indexOf('query: q, shopId, currency');
    expect(start).toBeGreaterThan(-1);
    /**
     * Anchored on the literal's last field rather than on a brace: a
     * fixed-width window cut the comment off mid-object, and `}),` matched
     * the inline `: {})` spread a few lines earlier.
     */
    const end = MODAL.indexOf('bypassCache:', start);
    expect(end).toBeGreaterThan(start);
    const body = MODAL.slice(start, end);
    for (const field of ['vehicleId', 'vin', 'make', 'model', 'year', 'trim', 'engine']) {
      expect(body).toContain(field);
    }
  });

  it('the server re-reads the canonical vehicle regardless of mode', () => {
    // Resolution is not conditional on the search mode.
    expect(ROUTE).toContain('await loadCanonicalVehicle(input.shopId, input.vehicleId)');
  });

  it('an OEM search is not scoped by the vehicle-first gate', () => {
    // oem_search answers identity directly; the vehicle-scoped call would be
    // a second call answering a question already answered.
    const gate = readFileSync(
      join(process.cwd(), 'lib/parts/vehicleFirst/gate.ts'), 'utf8');
    expect(gate).toContain('if (input.oemNumber || input.manufacturerPartNumber) return undefined;');
  });
});

describe('the empty-parts message does not contradict the references', () => {
  /**
   * Found live on staging: "NO MATCHING PARTS FOUND. YOU CAN STILL ADD THE
   * PART MANUALLY." printed directly above 91 OEM references the same search
   * had just returned. Both sentences were true — no PURCHASABLE part
   * matched — and together they read as a contradiction.
   */
  it('says something different when references were found', () => {
    expect(MODAL).toContain('No priced parts matched directly');
    expect(MODAL).toContain('pick one below to search it');
  });

  it('branches on whether any reference exists', () => {
    expect(MODAL).toContain("state === 'empty' && (vehicleOem?.groups.length ?? 0) > 0");
    expect(MODAL).toContain("state === 'empty' && !(vehicleOem?.groups.length ?? 0)");
  });

  it('keeps the manual fallback for a genuinely empty search', () => {
    // With no parts AND no references, manual entry is still the way out.
    expect(MODAL).toContain('No matching parts found. {MANUAL_FALLBACK}');
  });
});

describe('model-level ambiguity is stated, never guessed past', () => {
  it('has its own screen', () => {
    expect(MODAL).toContain('data-testid="model-ambiguous"');
    expect(MODAL).toContain('VEHICLE MODEL AMBIGUOUS');
  });

  it('is driven by the reason code, not by guessing from status', () => {
    expect(ROUTE).toContain('reasonCode: outcome.reasonCode');
    expect(MODAL).toContain("resolution?.reasonCode === 'model_ambiguous'");
  });

  it('says what is required to continue', () => {
    expect(MODAL).toContain('multiple model series matching this vehicle');
    expect(MODAL).toContain('model-series selection is required');
  });

  it('offers both ways forward', () => {
    expect(MODAL).toContain('Search by OEM Instead');
    expect(MODAL).toContain('Add Part Manually');
  });

  it('states plainly that nothing was assumed', () => {
    expect(MODAL).toContain('Nothing has been assumed');
  });

  it('does not also show the generic unresolved banner', () => {
    // Two competing explanations of one state is worse than one.
    expect(MODAL).toContain("resolution.reasonCode !== 'model_ambiguous'");
  });
});

describe('a marque contradiction is only claimed when there is one', () => {
  /**
   * Seen live on staging: an OEM search on an estimate with no linked vehicle
   * rendered "≠ AUDI". There was no vehicle to differ FROM. Absence is not
   * contradiction — the same rule that governs fitment.
   */
  it('has three states, not two', () => {
    expect(MODAL).toContain("data-marque-state={!known ? 'unknown' : matches ? 'match' : 'contradiction'}");
  });

  it('shows the ≠ mark only for a real contradiction', () => {
    expect(MODAL).toContain("{contradicts ? '≠ ' : ''}");
    expect(MODAL).toContain('const contradicts = known && !matches;');
  });

  it('says why it cannot compare when no vehicle is known', () => {
    expect(MODAL).toContain('No vehicle on this estimate to compare against');
  });

  it('does not colour an unknown comparison as a warning', () => {
    // Amber reads as "something is wrong". Nothing is wrong; we just cannot say.
    expect(MODAL).toContain("color: !known ? 'var(--muted)' : matches ? '#16a34a' : '#b45309'");
  });
});
