/**
 * Vehicle-first description search, against the contract the provider ACTUALLY
 * has.
 *
 * ## What changed and why
 *
 * The first version of this suite tested an imagined response: articles with
 * a brand, a part number, an image and a product group. One controlled live
 * call against a resolved Porsche Cayenne (92A) showed the endpoint returns
 * 186 rows carrying exactly two string fields:
 *
 *     articleOemNo         186 distinct values
 *     articleProductName     1 distinct value
 *
 * Those tests passed the whole time. They asserted that the code did what I
 * had assumed, which is not the same as asserting it works — and on staging it
 * produced 186 identical, unpickable cards each claiming LIKELY FIT.
 *
 * So the fixture here is a sanitized copy of the real payload, and the tests
 * assert against that instead of against my earlier guess.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { searchRelevance } from '../vehicleFirst/search';
import { searchTermSegment, oemPartsForVehiclePath } from '../providers/autopartsapi/endpoints';
import { buildProviderUrl } from '../providers/autopartsapi/client';

const BASE = 'https://auto-parts-catalog.apiprofile.com/api';
const SERVICE = readFileSync(
  join(process.cwd(), 'lib/parts/vehicleFirst/search.ts'), 'utf8');
const FIXTURE = JSON.parse(readFileSync(
  join(process.cwd(), 'lib/parts/__tests__/fixtures/vehicleOemSearch.live.json'), 'utf8'));

describe('a technician can type what they actually say', () => {
  it('accepts a multi-word term', () => {
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
    expect(() => searchTermSegment(term)).toThrow();
  });

  it('refuses an over-long term', () => {
    expect(() => searchTermSegment('x'.repeat(61))).toThrow();
  });

  it('still refuses an ENCODED separator at the URL boundary', () => {
    expect(() => buildProviderUrl('articles-oem/x%2fadmin')).toThrow();
    expect(() => buildProviderUrl('articles-oem/%2e%2e')).toThrow();
  });
});

describe('the fixture records the real contract', () => {
  it('is a bare array of two-field rows', () => {
    expect(FIXTURE._shape.topLevel).toBe('array');
    expect(FIXTURE._shape.keysPerRow).toEqual(['articleOemNo', 'articleProductName']);
  });

  it('carries none of the fields the first implementation assumed', () => {
    const keys = new Set(FIXTURE.rows.flatMap((r: object) => Object.keys(r)));
    for (const absent of [
      'articleNo', 'supplierName', 'manufacturerName', 's3image',
      'productGroup', 'productGroupName', 'articleId',
    ]) {
      expect(keys.has(absent)).toBe(false);
    }
  });

  it('repeats one product name across many OEM numbers', () => {
    // This is why the answer is grouped: 186 rows of one product name is one
    // answer with many part numbers, not 186 answers.
    expect(FIXTURE._shape.distinctArticleProductName).toBe(1);
    expect(FIXTURE._shape.distinctArticleOemNo).toBe(FIXTURE._shape.rowCount);
  });
});

describe('the service answers with OEM numbers, not parts', () => {
  it('returns groups rather than results', () => {
    expect(SERVICE).toContain('VehicleOemGroup');
    expect(SERVICE).toContain('oemNumbers');
  });

  it('claims no brand, price, image or availability', () => {
    // None of these can be honestly populated from a two-field response.
    for (const invented of [
      'itemPrice', 'landedCost', 'imageUrl', 'brand:',
      'shippingCost', 'estimatedTax',
    ]) {
      expect(SERVICE).not.toContain(invented);
    }
  });

  it('makes no fitment claim at all', () => {
    // Fitment describes a part. These are numbers, so the field is absent
    // rather than set to a hedge.
    expect(SERVICE).not.toContain('fitmentStatus');
  });

  it('normalises OEM numbers so spacing does not split one part in two', () => {
    // "7L0 698 151 M" and "7L0698151M" are the same number.
    expect(SERVICE).toContain('normalizePartNumber(oem)');
  });

  it('caps nothing, and paging happens in the UI', () => {
    // There was a MAX_OEM_PER_GROUP of 60, which silently discarded 126 of
    // the 186 live references while the count still read like the whole
    // answer. Narrowing is the list's job, not the fetch's.
    expect(SERVICE).not.toContain('MAX_OEM_PER_GROUP');
    expect(SERVICE).toContain('EVERY reference, never a slice');
  });

  it('skips rows missing either field', () => {
    // The fixture deliberately holds one row with an empty OEM number and one
    // with an empty product name.
    expect(SERVICE).toContain('if (!name || !oem) continue;');
  });
});

describe('search relevance is its own question', () => {
  it('rates an exact kind of part highly', () => {
    expect(searchRelevance('brake pads', 'Brake Pad Set, disc brake')).toBe('high');
  });

  it('rates a different part in the same system lower', () => {
    expect(searchRelevance('brake pads', 'Brake Disc')).not.toBe('high');
  });

  it('rates an unrelated part low', () => {
    expect(searchRelevance('brake pads', 'Oil Filter')).toBe('low');
  });

  it('ignores short noise words', () => {
    expect(searchRelevance('the pads for it', 'Brake Pad Set')).not.toBe('low');
  });

  it('matches a plural against the catalogue singular', () => {
    expect(searchRelevance('pads', 'Brake Pad Set')).toBe('high');
    expect(searchRelevance('discs', 'Brake Disc')).toBe('high');
  });

  it('does not merge words that are genuinely different parts', () => {
    expect(searchRelevance('hose', 'Hoses')).toBe('high');
    expect(searchRelevance('bearing', 'Brake Pad Set')).toBe('low');
  });

  it('scores the real product name from the live response', () => {
    expect(searchRelevance('brake pads', FIXTURE.rows[0].articleProductName)).toBe('high');
  });

  it('is deterministic', () => {
    expect(searchRelevance('brake pads', 'Brake Pad Set, disc brake'))
      .toBe(searchRelevance('brake pads', 'Brake Pad Set, disc brake'));
  });

  it('admits the endpoint pre-filters, so it rarely discriminates here', () => {
    // Honesty in the source rather than a claim the score is doing more work
    // than it is: the provider already filtered by the term.
    expect(SERVICE).toContain('filters by the search term');
  });
});

describe('the call is accounted for', () => {
  it('declares its category and context', () => {
    expect(SERVICE).toContain("category: 'vehicle_parts_search', callContext: 'application'");
  });

  it('spends exactly one call', () => {
    expect(SERVICE).toContain('externalCalls: 1');
  });

  it('the category is permitted by the database constraint', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/2026-08-25_m_parts2c_endpoint_category.sql'), 'utf8');
    expect(migration).toContain("'vehicle_parts_search'");
    expect(migration).toContain('the category constraint accepted an unknown value');
  });
});
