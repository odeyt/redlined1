/**
 * Regression against the LIVE response shape, captured 2026-08-24.
 *
 * The first normaliser was written against guessed field names and produced
 * ZERO records from a 277-row live response. This fixture is the real shape,
 * sanitised: media filenames and image paths redacted, three rows kept out of
 * 277, no credential anywhere.
 *
 * ## The thing this shape taught us
 *
 * Searching OEM `04465-0K340` — a Toyota number — returns rows whose
 * `manufacturerName` is CHRYSLER and FORD as well as TOYOTA. OEM numbers
 * collide across marques once punctuation is normalised away, so an exact
 * digit match is NOT on its own evidence about the vehicle on the estimate.
 *
 * That is the single most important thing the live call revealed, and reading
 * the code would never have shown it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  normalizeAutoPartsResponse, normalizeAutoPartsArticle, vehicleManufacturer,
} from '../providers/autopartsapi/normalize';
import type { AutoPartsArticle, AutoPartsLanguageRow } from '../providers/autopartsapi/types';
import type { PartsSearchInput } from '../types';

const FIXTURE = JSON.parse(readFileSync(
  join(process.cwd(), 'lib/parts/__tests__/fixtures/autopartsapi-oem-search.json'), 'utf8',
)) as AutoPartsArticle[];

const CHECKED_AT = '2026-08-24T00:00:00.000Z';
const OEM = '04465-0K340';

const TOYOTA: PartsSearchInput = {
  query: OEM, oemNumber: OEM,
  year: 2019, make: 'Toyota', model: 'Tacoma', currency: 'USD',
};

describe('the live envelope is a bare array', () => {
  it('normalises every row', () => {
    // The live response is a top-level array, not { data: [...] }.
    const out = normalizeAutoPartsResponse(FIXTURE, TOYOTA, { checkedAt: CHECKED_AT });
    expect(out).toHaveLength(3);
  });

  it('produces MORE than zero — the failure that started this', () => {
    expect(normalizeAutoPartsResponse(FIXTURE, TOYOTA, { checkedAt: CHECKED_AT }).length)
      .toBeGreaterThan(0);
  });
});

describe('the live field names, read correctly', () => {
  const toyotaRow = FIXTURE.find(a => a.manufacturerName === 'TOYOTA')!;
  const r = () => normalizeAutoPartsArticle(toyotaRow, TOYOTA, { checkedAt: CHECKED_AT })!;

  it('uses articleProductName as the description', () => {
    expect(r().title).toBe('Brake Pad Set, disc brake');
  });

  it('uses articleNo as the part number', () => {
    expect(r().manufacturerPartNumber).toBe('ADT342192');
  });

  it('uses supplierName as the BRAND, not manufacturerName', () => {
    // manufacturerName is TOYOTA — the vehicle marque. Reading it as the brand
    // would put "TOYOTA" on an estimate line for a BLUE PRINT pad.
    expect(r().brand).toBe('BLUE PRINT');
    expect(r().brand).not.toBe('TOYOTA');
  });

  it('exposes manufacturerName separately as the vehicle marque', () => {
    expect(vehicleManufacturer(toyotaRow)).toBe('TOYOTA');
  });

  it('uses s3image for the image', () => {
    expect(r().imageUrl).toContain('https://fsn1.your-objectstorage.com/');
  });

  it('keeps articleId as the listing id', () => {
    expect(r().providerListingId).toBe('7712004');
  });

  it('records the matched OEM number', () => {
    expect(r().oemNumbers).toContain('04465-0K340');
  });
});

describe('a catalogue row still quotes no price', () => {
  it('has no item price, no landed cost, and is not free', () => {
    const out = normalizeAutoPartsResponse(FIXTURE, TOYOTA, { checkedAt: CHECKED_AT });
    for (const r of out) {
      expect(r.itemPrice).toBeUndefined();
      expect(r.landedCost).toBeUndefined();
      // `unknown`, never a zero that would rank it as the cheapest option.
      expect(r.landedCostCompleteness).toBe('unknown');
    }
  });
});

describe('OEM numbers collide across marques — the live finding', () => {
  const out = () => normalizeAutoPartsResponse(FIXTURE, TOYOTA, { checkedAt: CHECKED_AT });

  it('the Toyota row matches the number AND the marque', () => {
    const toyota = out().find(r => r.manufacturerPartNumber === 'ADT342192')!;
    expect(toyota.fitmentStatus).toBe('likely');
    expect(toyota.fitmentReason).toContain('cross-references');
  });

  it('a CHRYSLER row for the same digits is NOT treated as this vehicle', () => {
    // Same normalised OEM number, different marque. Exact digits are not
    // evidence about a Tacoma.
    const chrysler = out().find(r => r.manufacturerPartNumber === 'T360A127')!;
    expect(chrysler.fitmentStatus).toBe('unverified');
    expect(chrysler.fitmentReason).toContain('CHRYSLER');
    expect(chrysler.fitmentReason).toContain('collide across marques');
  });

  it('never reaches verified from a catalogue row alone', () => {
    for (const r of out()) expect(r.fitmentStatus).not.toBe('verified');
  });

  it('normalises the catalogue\'s own punctuation of the number', () => {
    // The catalogue echoes "044650-K340" for a request of "04465-0K340".
    // Both are the same digits and must compare equal.
    const differentlyPunctuated = FIXTURE.find(a => a.articleSearchNo === '044650-K340')!;
    const r = normalizeAutoPartsArticle(
      differentlyPunctuated, { ...TOYOTA, make: 'Chrysler' }, { checkedAt: CHECKED_AT })!;
    // Marque agrees here, so the number match is allowed to count.
    expect(r.fitmentStatus).toBe('likely');
  });
});

describe('the language list, as it really comes back', () => {
  // Observed: { lngId: "4", lngIso2: "en", lngDescription: "English (GB)" }
  const LIVE_ROWS: AutoPartsLanguageRow[] = [
    { lngId: '1', lngIso2: 'de', lngDescription: 'Deutsch' },
    { lngId: '4', lngIso2: 'en', lngDescription: 'English (GB)' },
  ];

  it('is named "English (GB)", so exact equality on "english" finds nothing', () => {
    // The first resolver compared for equality and reported `malformed`
    // against a perfectly good response.
    expect(LIVE_ROWS[1].lngDescription!.toLowerCase()).not.toBe('english');
    expect(LIVE_ROWS[1].lngDescription!.toLowerCase().startsWith('english')).toBe(true);
  });

  it('carries lngId as a STRING', () => {
    // A NaN in a path reads downstream as an authentication failure.
    expect(typeof LIVE_ROWS[1].lngId).toBe('string');
    expect(Number(LIVE_ROWS[1].lngId)).toBe(4);
  });

  it('confirms the documented langId=4 is English', () => {
    expect(LIVE_ROWS.find(r => r.lngIso2 === 'en')!.lngId).toBe('4');
  });
});

describe('the fixture carries no secret', () => {
  it('is sanitised', () => {
    const raw = readFileSync(
      join(process.cwd(), 'lib/parts/__tests__/fixtures/autopartsapi-oem-search.json'), 'utf8');
    expect(raw).toContain('REDACTED');
    expect(raw).not.toMatch(/apiprofile-key/i);
    // Three rows kept out of 277 — a regression fixture, not a data mirror.
    expect(FIXTURE).toHaveLength(3);
  });
});
