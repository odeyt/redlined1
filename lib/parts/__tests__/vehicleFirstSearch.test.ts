/**
 * Vehicle-first description search.
 *
 * The technician asks "front brake pads for this car" instead of supplying an
 * OEM number they are trying to find. Three questions stay separate, and the
 * separation is the whole design:
 *
 *   SEARCH RELEVANCE  is this the kind of part I asked for?
 *   PART MATCH        is this article the part it claims to be?
 *   VEHICLE FITMENT   does it go on THIS car?
 *
 * A brake disc can be a perfect part, perfectly fitted, and a poor answer to
 * "brake pads".
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { searchRelevance } from '../vehicleFirst/search';
import { searchTermSegment, oemPartsForVehiclePath } from '../providers/autopartsapi/endpoints';
import { buildProviderUrl } from '../providers/autopartsapi/client';

const BASE = 'https://auto-parts-catalog.apiprofile.com/api';
const SERVICE = readFileSync(
  join(process.cwd(), 'lib/parts/vehicleFirst/search.ts'), 'utf8');

describe('a technician can type what they actually say', () => {
  it('accepts a multi-word term', () => {
    // The earlier rule refused anything with a space, which refused the most
    // likely thing anyone types. That is a broken feature wearing a safety
    // rule.
    expect(searchTermSegment('front brake pads')).toBe('front%20brake%20pads');
  });

  it('builds a usable URL from one', () => {
    const url = buildProviderUrl(oemPartsForVehiclePath({
      typeId: 1, vehicleId: 5501, searchParam: 'front brake pads',
    }));
    expect(url).toBe(
      `${BASE}/articles-oem/selecting-oem-parts-vehicle-modification-description-product-group`
      + `/type-id/1/vehicle-id/5501/lang-id/4/search-param/front%20brake%20pads`);
  });

  it.each([
    ['a slash', 'brake/pads'],
    ['a backslash', 'brake\\pads'],
    ['a query', 'pads?x=1'],
    ['a fragment', 'pads#x'],
    ['a raw percent', 'pads%2fadmin'],
    ['empty', '   '],
  ])('refuses %s', (_label, term) => {
    // Validate, then encode. What is removed is anything that could change
    // the SHAPE of the URL rather than the content of one segment.
    expect(() => searchTermSegment(term)).toThrow();
  });

  it('refuses an over-long term', () => {
    expect(() => searchTermSegment('x'.repeat(61))).toThrow();
  });

  it('still refuses an ENCODED separator at the URL boundary', () => {
    // Belt and braces: even if a term got past, the path builder rejects a
    // smuggled %2f, which the provider would decode into a path boundary.
    expect(() => buildProviderUrl('articles-oem/x%2fadmin')).toThrow();
    expect(() => buildProviderUrl('articles-oem/%2e%2e')).toThrow();
  });

  it('allows ordinary percent-encoding through the path builder', () => {
    expect(buildProviderUrl('a/front%20brake%20pads')).toBe(`${BASE}/a/front%20brake%20pads`);
  });
});

describe('search relevance is its own question', () => {
  const row = (name: string, group?: string) =>
    ({ articleProductName: name, productGroupName: group });

  it('rates an exact kind of part highly', () => {
    expect(searchRelevance('brake pads', row('Brake Pad Set, disc brake', 'Brake Pad Set')))
      .toBe('high');
  });

  it('rates a different part in the same system lower', () => {
    // A brake disc is a fine part and a poor answer to "brake pads".
    expect(searchRelevance('brake pads', row('Brake Disc', 'Brake Disc')))
      .not.toBe('high');
  });

  it('rates an unrelated part low', () => {
    expect(searchRelevance('brake pads', row('Oil Filter', 'Oil Filter'))).toBe('low');
  });

  it('ignores short noise words', () => {
    expect(searchRelevance('the pads for it', row('Brake Pad Set'))).not.toBe('low');
  });

  it('matches a plural against the catalogue singular', () => {
    // "brake pads" vs "Brake Pad Set" is the commonest search in a workshop,
    // and without this it scored medium against a perfect answer.
    expect(searchRelevance('pads', row('Brake Pad Set'))).toBe('high');
    expect(searchRelevance('discs', row('Brake Disc'))).toBe('high');
  });

  it('does not merge words that are genuinely different parts', () => {
    // The rule is one trailing "s" and nothing more — a real stemmer starts
    // collapsing distinct components.
    expect(searchRelevance('hose', row('Hoses'))).toBe('high');
    expect(searchRelevance('bearing', row('Brake Pad Set'))).toBe('low');
  });

  it('is deterministic', () => {
    const r = row('Brake Pad Set, disc brake', 'Brake Pad Set');
    expect(searchRelevance('brake pads', r)).toBe(searchRelevance('brake pads', r));
  });

  it('never becomes a fitment claim', () => {
    /**
     * Three questions, three answers. Relevance must not leak into fitment.
     *
     * This used to be a proximity regex — "relevance must not appear within
     * 80 characters of fitmentStatus" — which only measured where lines sit
     * in an object literal, and which any reordering would satisfy without
     * making the code one bit safer. The real invariant is that
     * `fitmentStatus` is assigned a CONSTANT, never anything computed from
     * the query.
     */
    const assignments = [...SERVICE.matchAll(/fitmentStatus:\s*([^,\n]+)/g)]
      .map(m => m[1].trim());
    expect(assignments.length).toBeGreaterThan(0);
    for (const value of assignments) {
      expect(value).toMatch(/^'(unknown|unlikely|likely|verified)'$/);
    }
  });
});

describe('a vehicle-scoped result is LIKELY, never verified', () => {
  it('sets likely and says why', () => {
    expect(SERVICE).toContain("fitmentStatus: 'likely'");
    expect(SERVICE).toContain('does not state this list is exact');
  });

  it('never sets verified from catalogue membership', () => {
    // Membership of a vehicle-scoped set is not proof the set is exact for
    // the resolved variant. Only OEM applicability, matched against a
    // specific variant, produces `verified`.
    expect(SERVICE).not.toContain("fitmentStatus: 'verified'");
  });

  it('records the reason the upgrade is withheld', () => {
    expect(SERVICE).toMatch(/vehicle_catalog_result/);
  });
});

describe('results carry identity, never a price', () => {
  it('claims no price', () => {
    expect(SERVICE).toContain('itemPrice: undefined');
    expect(SERVICE).toContain("landedCostCompleteness: 'unknown'");
  });

  it('reads supplierName as the brand, not manufacturerName', () => {
    // The M-PARTS2A lesson: manufacturerName is the vehicle marque.
    expect(SERVICE).toContain('brand = safeText(r.supplierName');
    expect(SERVICE).toContain('vehicleManufacturer: safeText(r.manufacturerName');
  });

  it('only groups rows that share a brand AND a part number', () => {
    // Two rows that merely look alike are not one part — the same
    // description under two suppliers is two products.
    expect(SERVICE).toContain('mpn && brand');
  });
});

describe('categories are derived, never invented', () => {
  it('groups by the provider product group present in results', () => {
    // There is no documented category-listing endpoint. Building a
    // Redlined1-to-provider category map without one would be a guess.
    expect(SERVICE).toContain('productGroups');
    expect(SERVICE).toContain('Derived from what came back');
  });

  it('spends no extra call to build them', () => {
    expect(SERVICE).toContain('externalCalls: 1');
  });
});

describe('the call is accounted for', () => {
  it('declares its category and context', () => {
    expect(SERVICE).toContain("category: 'vehicle_parts_search', callContext: 'application'");
  });

  it('the category is permitted by the database constraint', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/2026-08-25_m_parts2c_endpoint_category.sql'), 'utf8');
    expect(migration).toContain("'vehicle_parts_search'");
    // And the migration proves the constraint still refuses an unknown value.
    expect(migration).toContain('the category constraint accepted an unknown value');
  });
});
