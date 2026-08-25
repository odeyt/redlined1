/**
 * What the vehicle-first block is allowed to say.
 *
 * There is no React Testing Library in this project, so these read the source
 * rather than the rendered output. That limit is real and worth stating: they
 * prove the strings and the wiring exist, not that a technician sees them.
 * The screen itself is checked on staging, on a real device — which is how
 * both of the bugs these tests now guard were found in the first place.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const MODAL = readFileSync(
  join(process.cwd(), 'features/estimates/PartsSearchModal.tsx'), 'utf8');
const ROUTE = readFileSync(
  join(process.cwd(), 'app/api/parts/search/route.ts'), 'utf8');

describe('OEM numbers are presented as numbers, not as parts', () => {
  /**
   * The live response carries a part name and an OEM number and nothing else.
   * Rendering those as result cards produced 186 identical rows, each with a
   * 'Select this part' button a technician could only press at random.
   */
  it('renders them in their own block', () => {
    expect(MODAL).toContain('data-testid="vehicle-oem"');
    expect(MODAL).toContain('OEM NUMBERS FOR THIS VEHICLE');
  });

  it('says plainly that they are not offers', () => {
    expect(MODAL).toContain('These are part numbers,');
    expect(MODAL).toContain('not offers');
  });

  it('makes each number run the OEM search that can price it', () => {
    expect(MODAL).toContain("setMode('oem')");
    expect(MODAL).toContain("runSearch(false, { term: oem, mode: 'oem' })");
  });

  it('never gives them a fitment badge', () => {
    // Fitment describes a part. A number is not a part.
    const block = MODAL.slice(MODAL.indexOf('data-testid="vehicle-oem"'));
    const end = block.indexOf('── Results ──');
    expect(block.slice(0, end > 0 ? end : 2500)).not.toContain('FITMENT_LABEL');
  });

  it('carries no result-card relevance or product-group badge any more', () => {
    // Both were fed by fields the provider does not send.
    expect(MODAL).not.toContain('data-testid="row-relevance"');
    expect(MODAL).not.toContain('r.productGroup');
  });
});

describe('the fitment palette still means only fitment', () => {
  it('is indexed by fitment status alone', () => {
    const indexes = [...MODAL.matchAll(/FITMENT_(?:COLOR|LABEL|ORDER)\[([^\]]+)\]/g)]
      .map(m => m[1].trim());
    expect(indexes.length).toBeGreaterThan(0);
    for (const expr of indexes) expect(expr).toMatch(/fitmentStatus$/);
  });
});

describe('an unidentified vehicle says so, rather than blaming the catalogue', () => {
  /**
   * Found by the first live staging run. The 2009 S-Class resolved
   * `ambiguous` at the MODEL step — two catalogue series matched — which
   * yields no modification candidates, so the variant chooser could not
   * render. The technician saw only "No matching parts found".
   *
   * That reads as "the catalogue has nothing for your car". The truth was
   * that the vehicle-scoped search never ran.
   */
  it('renders a distinct state for an unresolved vehicle', () => {
    expect(MODAL).toContain('data-testid="vehicle-unresolved"');
    expect(MODAL).toContain('could not be identified in the parts catalogue');
  });

  it('covers every non-resolved status, not just ambiguous', () => {
    // not_found and insufficient_data leave the technician equally stranded.
    expect(MODAL).toContain("resolution.status !== 'resolved'");
  });

  it('does not fire while a real choice is on offer', () => {
    // When the chooser CAN render, it owns the screen — two competing
    // explanations of the same state is worse than one.
    expect(MODAL).toContain("!(pendingSearch && (resolution.candidates?.length ?? 0) > 1)");
  });

  it('shows the reason the catalogue gave', () => {
    expect(MODAL).toContain('{resolution.reason}');
  });

  it('says fitment cannot be verified, and names the way forward', () => {
    expect(MODAL).toContain('fitment cannot be verified');
    expect(MODAL).toContain('Searching by OEM or part number still works');
  });
});

describe('the route only scopes a search it is entitled to scope', () => {
  it('delegates the decision to the tested gate', () => {
    expect(ROUTE).toContain('vehicleFirstTarget(input, outcome.resolution)');
  });

  it('does not re-derive the vehicle id at the call site', () => {
    const call = ROUTE.slice(ROUTE.indexOf('searchOemNumbersForVehicle({'));
    expect(call.slice(0, 300)).toContain('providerVehicleId: resolvedProviderVehicleId');
  });

  it('never merges OEM numbers into the parts result list', () => {
    // They have no brand, price or availability. In the results array they
    // became 186 unpickable cards.
    const call = ROUTE.slice(ROUTE.indexOf('searchOemNumbersForVehicle({'));
    expect(call.slice(0, 1200)).not.toContain('results.unshift');
    expect(ROUTE).toContain('vehicleOem');
  });

  it('never lets a vehicle-first failure break the search', () => {
    expect(ROUTE).toContain('parts_vehicle_first_search_failed');
    const block = ROUTE.slice(ROUTE.indexOf('searchOemNumbersForVehicle({'));
    expect(block.slice(0, 1400)).toMatch(/\} catch \{/);
  });
});
