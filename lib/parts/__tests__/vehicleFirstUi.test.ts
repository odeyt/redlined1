/**
 * What the vehicle-first result card is allowed to say.
 *
 * There is no React Testing Library in this project, so these read the source
 * rather than the rendered output. That limit is real and worth stating: they
 * prove the strings and the wiring exist, not that a technician sees them.
 * The screen itself is checked on staging, on a real device.
 *
 * What they DO catch is the failure that matters most here — three separate
 * questions quietly collapsing into one verdict.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const MODAL = readFileSync(
  join(process.cwd(), 'features/estimates/PartsSearchModal.tsx'), 'utf8');
const ROUTE = readFileSync(
  join(process.cwd(), 'app/api/parts/search/route.ts'), 'utf8');

describe('relevance and fitment stay visibly different things', () => {
  it('renders relevance as its own field', () => {
    expect(MODAL).toContain('data-testid="row-relevance"');
  });

  it('never dresses relevance in the fitment palette', () => {
    /**
     * Fitment green means "this fits". Reusing it for a strong word match
     * would read as a fitment claim to anyone scanning the column.
     *
     * Asserted as "the fitment palette is only ever indexed by fitment",
     * which holds whichever way round the expression is written. The first
     * version of this test matched `searchRelevance ... FITMENT_COLOR` on one
     * line and so missed `FITMENT_COLOR[r.searchRelevance]` — the exact shape
     * the bug would take.
     */
    expect(MODAL).toContain('RELEVANCE_COLOR');
    const indexes = [...MODAL.matchAll(/FITMENT_(?:COLOR|LABEL|ORDER)\[([^\]]+)\]/g)]
      .map(m => m[1].trim());
    expect(indexes.length).toBeGreaterThan(0);
    for (const expr of indexes) expect(expr).toMatch(/fitmentStatus$/);
  });

  it('says in words which question it answers', () => {
    expect(MODAL).toContain('MATCHES YOUR SEARCH');
    expect(MODAL).toContain('DIFFERENT PART');
    // The tooltip has to draw the line explicitly, because the two fields sit
    // side by side.
    expect(MODAL).toContain('not whether it fits');
  });

  it('keeps the fitment label rendering from the fitment status alone', () => {
    expect(MODAL).toContain('{FITMENT_LABEL[r.fitmentStatus]}');
  });
});

describe('categories filter, they do not re-query', () => {
  it('narrows results already held', () => {
    expect(MODAL).toContain("results.filter(r => r.productGroup === groupFilter)");
  });

  it('does not run a search when a chip is clicked', () => {
    expect(MODAL).toMatch(/onClick=\{\(\) => setGroupFilter\(g\.name\)\}/);
  });

  it('clears the selection on a new search', () => {
    // Groups come from the results, so last search's category is meaningless
    // against this one's — and worse, would silently hide everything.
    const handler = MODAL.slice(MODAL.indexOf('setProductGroups('));
    expect(handler.slice(0, 200)).toContain('setGroupFilter(null)');
  });

  it('explains an empty category instead of showing a blank panel', () => {
    expect(MODAL).toContain('No results in {groupFilter}');
    expect(MODAL).toContain('Show all');
  });

  it('hides the chip row when there is nothing to choose between', () => {
    expect(MODAL).toContain('productGroups.length > 1');
  });
});

describe('the route only scopes a search it is entitled to scope', () => {
  it('delegates the decision to the tested gate', () => {
    expect(ROUTE).toContain('vehicleFirstTarget(input, outcome.resolution)');
  });

  it('does not re-derive the vehicle id at the call site', () => {
    // The gate returns the id precisely so this cannot drift from it.
    const call = ROUTE.slice(ROUTE.indexOf('searchPartsForVehicle({'));
    expect(call.slice(0, 300)).toContain('providerVehicleId: resolvedProviderVehicleId');
  });

  it('never lets a vehicle-first failure break the search', () => {
    expect(ROUTE).toContain('parts_vehicle_first_search_failed');
    const block = ROUTE.slice(ROUTE.indexOf('searchPartsForVehicle({'));
    expect(block.slice(0, 900)).toMatch(/\} catch \{/);
  });
});
