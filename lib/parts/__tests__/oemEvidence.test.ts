/**
 * OEM evidence, close-match safety and single-provider scoring.
 *
 * The rule under test is that six different provider answers stay six
 * different answers. A partial match is a string that looked similar; an
 * analogue is a supplier's opinion; only an applicability record speaks about
 * a vehicle at all. Collapsing them into "verified" is the failure mode, and
 * every test here exists to make it impossible.
 */
import {
  equivalenceFrom, isDiscoveryOnly, matchScore, buildVerdict,
  fitmentFromApplicability, MATCH_WEIGHTS, MAX_MATCH_SCORE, EQUIVALENCE_LABEL,
  AUTHORITATIVE_EVIDENCE, hasAuthoritativeEvidence,
  type EvidenceItem, type VehicleApplicability,
} from '../providers/autopartsapi/evidence';
import {
  oemSegment, searchByOemQuery, equalOemPath, vehicleApplicabilityPath,
  aftermarketCrossRefPath, analoguesPath, articleCrossRefPath, oemPartsForVehiclePath,
  toAutoPartsTypeId, AUTOPARTS_ENGLISH_LANG_ID, AUTOPARTS_DEFAULT_COUNTRY_FILTER_ID,
  AUTOPARTS_TYPE_ID, SEARCH_BY_OEM,
} from '../providers/autopartsapi/endpoints';
import { buildProviderUrl } from '../providers/autopartsapi/client';
import { extractApplicability } from '../providers/autopartsapi/normalize';

const BASE = 'https://auto-parts-catalog.apiprofile.com/api';
const ev = (kind: EvidenceItem['kind']): EvidenceItem =>
  ({ kind, detail: 'x', source: 'articles-oem' });

const TACOMA = { make: 'Toyota', model: 'Tacoma', year: 2019 };

describe('documented endpoints are built, not guessed', () => {
  it('builds the primary OEM search with query parameters', () => {
    const url = buildProviderUrl(SEARCH_BY_OEM, searchByOemQuery('04465-0K340'));
    expect(url).toBe(
      `${BASE}/articles-oem/search-by-article-oem-no?langId=4&articleOemNo=04465-0K340`);
  });

  it('builds the equal-OEM path', () => {
    expect(buildProviderUrl(equalOemPath('04465-0K340')))
      .toBe(`${BASE}/articles-oem/search-all-equal-oem-no/lang-id/4/article-oem-no/04465-0K340`);
  });

  it('builds the vehicle applicability path', () => {
    const url = buildProviderUrl(vehicleApplicabilityPath({
      typeId: toAutoPartsTypeId('car'), manufacturerId: 111, oem: '04465-0K340',
    }));
    expect(url).toBe(
      `${BASE}/articles-oem/selecting-a-list-of-cars-for-oem-part-number`
      + `/type-id/1/lang-id/4/country-filter-id/63/manufacturer-id/111`
      + `/article-oem-no/04465-0K340`);
  });

  it('builds the cross-reference paths', () => {
    expect(buildProviderUrl(aftermarketCrossRefPath('04465-0K340'))).toContain(
      'artlookup/search-for-the-oem-cross-references-through-aftermarket-parts-references/article-oem-no/04465-0K340');
    expect(buildProviderUrl(analoguesPath('04465-0K340'))).toContain(
      'artlookup/search-for-analogue-of-spare-parts-by-oem-number/article-oem-no/04465-0K340');
    expect(buildProviderUrl(articleCrossRefPath(9001))).toContain(
      'artlookup/select-article-cross-references/article-id/9001/lang-id/4');
  });

  it('accepts real OEM punctuation and refuses anything else', () => {
    expect(oemSegment('04465-0K340')).toBe('04465-0K340');
    expect(oemSegment('11.42.7.508.550')).toBe('11.42.7.508.550');
    expect(oemSegment(' act976 ')).toBe('ACT976');
    // An OEM number with a slash is not an OEM number, it is path probing.
    for (const bad of ['04465/0K340', '../admin', 'a b', '%2e%2e', '']) {
      expect(() => oemSegment(bad)).toThrow();
    }
  });

  it('refuses a multi-word search term as a path segment', () => {
    // Free text cannot be a path segment; the caller must use a query endpoint.
    expect(() => oemPartsForVehiclePath({
      typeId: 1, vehicleId: 5, searchParam: 'front brake pads',
    })).toThrow();
  });

  it('keeps provider ids inside the adapter', () => {
    expect(AUTOPARTS_ENGLISH_LANG_ID).toBe(4);
    expect(AUTOPARTS_DEFAULT_COUNTRY_FILTER_ID).toBe(63);
    expect(toAutoPartsTypeId('car')).toBe(AUTOPARTS_TYPE_ID.passengerCar);
    expect(toAutoPartsTypeId('truck')).toBe(AUTOPARTS_TYPE_ID.commercialVehicle);
    expect(toAutoPartsTypeId('motorbike')).toBe(AUTOPARTS_TYPE_ID.motorbike);
  });
});

describe('evidence strengths stay distinct', () => {
  it('an exact OEM hit is authoritative', () => {
    expect(equivalenceFrom([ev('exact_oem')])).toBe('verified_equivalent');
  });

  it('an equal-OEM confirmation is authoritative', () => {
    expect(equivalenceFrom([ev('equal_oem')])).toBe('verified_equivalent');
  });

  it('a cross-reference is confirmed but weaker', () => {
    expect(equivalenceFrom([ev('cross_reference')])).toBe('cross_referenced');
  });

  it('an analogue is a candidate, not a confirmation', () => {
    expect(equivalenceFrom([ev('analogue')])).toBe('analogue_candidate');
  });

  it('a partial match is discovery only', () => {
    expect(equivalenceFrom([ev('partial_match')])).toBe('discovery_only');
  });

  it('MANY partial matches are still discovery only', () => {
    // Ten weak signals are not one strong one.
    const many = Array.from({ length: 10 }, () => ev('partial_match'));
    expect(equivalenceFrom(many)).toBe('discovery_only');
    expect(isDiscoveryOnly(many)).toBe(true);
  });

  it('an MPN relation alone does not establish equivalence', () => {
    expect(equivalenceFrom([ev('mpn_relation')])).toBe('discovery_only');
    expect(isDiscoveryOnly([ev('mpn_relation'), ev('partial_match')])).toBe(true);
  });

  it('labels each level for the technician', () => {
    expect(EQUIVALENCE_LABEL.verified_equivalent).toBe('VERIFIED EQUIVALENT');
    expect(EQUIVALENCE_LABEL.discovery_only).toBe('PARTIAL MATCH');
  });

  it('names exactly which evidence is authoritative', () => {
    // Widening this list is the single change that widens what may be called
    // equivalent, so it is pinned rather than left implicit.
    expect([...AUTHORITATIVE_EVIDENCE].sort())
      .toEqual(['cross_reference', 'equal_oem', 'exact_oem']);
    expect(hasAuthoritativeEvidence([ev('analogue'), ev('partial_match')])).toBe(false);
    expect(hasAuthoritativeEvidence([ev('exact_oem')])).toBe(true);
  });
});

describe('single-provider scoring', () => {
  it('uses the documented weights', () => {
    expect(MATCH_WEIGHTS.exact_oem).toBe(40);
    expect(MATCH_WEIGHTS.vehicle_applicability).toBe(30);
    expect(MATCH_WEIGHTS.mpn_relation).toBe(15);
    expect(MATCH_WEIGHTS.equal_oem).toBe(10);
    expect(MATCH_WEIGHTS.analogue).toBe(5);
    // Discovery is worth nothing. It is how a candidate was found.
    expect(MATCH_WEIGHTS.partial_match).toBe(0);
  });

  it('awards nothing for a partial match', () => {
    expect(matchScore([ev('partial_match')])).toBe(0);
  });

  it('does not double-count exact OEM and cross-reference', () => {
    // Both weigh 40 and say nearly the same thing; holding both must not be 80.
    expect(matchScore([ev('exact_oem'), ev('cross_reference')])).toBe(40);
  });

  it('counts each KIND once, however many rows arrive', () => {
    // A chatty endpoint must not manufacture confidence.
    const chatty = Array.from({ length: 12 }, () => ev('cross_reference'));
    expect(matchScore(chatty)).toBe(40);
  });

  it('caps at 100 and never implies a second source', () => {
    const all: EvidenceItem[] = [
      ev('exact_oem'), ev('vehicle_applicability'), ev('mpn_relation'),
      ev('equal_oem'), ev('analogue'),
    ];
    expect(matchScore(all)).toBe(MAX_MATCH_SCORE);
    const verdict = buildVerdict({ evidence: all, applicability: [], vehicle: TACOMA });
    // There is one catalogue. The verdict says so rather than implying two agreed.
    expect(verdict.singleSource).toBe(true);
  });
});

describe('fitment comes only from vehicle applicability', () => {
  const record = (over: Partial<VehicleApplicability> = {}): VehicleApplicability => ({
    manufacturer: 'Toyota', model: 'Tacoma', yearFrom: 2016, yearTo: 2023, ...over,
  });

  it('verifies when make, model and year all line up', () => {
    const f = fitmentFromApplicability([record()], TACOMA);
    expect(f.status).toBe('verified');
    expect(f.reason).toContain('2016');
  });

  it('is likely when the year falls outside the window', () => {
    // NOT incompatible: the provider describes what it lists, and absence is
    // not a statement that the part does not fit.
    const f = fitmentFromApplicability([record({ yearFrom: 2005, yearTo: 2015 })], TACOMA);
    expect(f.status).toBe('likely');
    expect(f.reason).toContain('2019');
  });

  it('is unverified when the model is not listed at all', () => {
    const f = fitmentFromApplicability([record({ model: 'Hilux' })], TACOMA);
    expect(f.status).toBe('unverified');
  });

  it('is unverified with no applicability records', () => {
    expect(fitmentFromApplicability([], TACOMA).status).toBe('unverified');
  });

  it('never returns incompatible — this endpoint makes no rejection', () => {
    for (const recs of [[], [record()], [record({ model: 'Hilux' })]]) {
      expect(fitmentFromApplicability(recs, TACOMA).status).not.toBe('incompatible');
    }
  });

  it('is unverified when the estimate has no vehicle to check against', () => {
    const f = fitmentFromApplicability([record()], {});
    expect(f.status).toBe('unverified');
    expect(f.reason).toContain('no vehicle');
  });

  it('ignores punctuation and case in make and model', () => {
    const f = fitmentFromApplicability(
      [record({ manufacturer: 'TOYOTA', model: 'TACOMA ' })], TACOMA);
    expect(f.status).toBe('verified');
  });
});

describe('close-match safety — the rule that must not bend', () => {
  const applicable: VehicleApplicability[] = [
    { manufacturer: 'Toyota', model: 'Tacoma', yearFrom: 2016, yearTo: 2023 },
  ];

  it('a partial match CANNOT reach verified fitment, even with applicability', () => {
    // The applicability is real, but we do not know this is the right part to
    // be checking it for — it was found by string similarity.
    const verdict = buildVerdict({
      evidence: [ev('partial_match')],
      applicability: applicable,
      vehicle: TACOMA,
    });
    expect(verdict.fitmentStatus).toBe('likely');
    expect(verdict.fitmentReason).toContain('partial match');
    expect(verdict.equivalence).toBe('discovery_only');
  });

  it('an exact OEM hit with applicability DOES reach verified', () => {
    const verdict = buildVerdict({
      evidence: [ev('exact_oem'), ev('vehicle_applicability')],
      applicability: applicable,
      vehicle: TACOMA,
    });
    expect(verdict.fitmentStatus).toBe('verified');
    expect(verdict.equivalence).toBe('verified_equivalent');
  });

  it('a high score alone does not create VERIFIED EQUIVALENT', () => {
    // 45 points from weak evidence. Equivalence is a statement about
    // authority, not a threshold.
    const verdict = buildVerdict({
      evidence: [ev('mpn_relation'), ev('vehicle_applicability')],
      applicability: applicable,
      vehicle: TACOMA,
    });
    expect(verdict.score).toBe(45);
    expect(verdict.equivalence).not.toBe('verified_equivalent');
  });

  it('an analogue never becomes an equivalent', () => {
    const verdict = buildVerdict({
      evidence: [ev('analogue')], applicability: applicable, vehicle: TACOMA,
    });
    expect(verdict.equivalence).toBe('analogue_candidate');
  });
});

describe('applicability extraction', () => {
  it('reads the shapes the provider might return', () => {
    const rows = [{ manufacturer: 'Toyota', model: 'Tacoma', yearFrom: '2016-01', yearTo: '2023-12' }];
    expect(extractApplicability(rows)).toEqual([
      { manufacturer: 'Toyota', model: 'Tacoma', yearFrom: 2016, yearTo: 2023, description: undefined },
    ]);
    expect(extractApplicability({ data: rows })).toHaveLength(1);
    expect(extractApplicability({ items: rows })).toHaveLength(1);
  });

  it('drops a row that names no vehicle', () => {
    // It cannot be matched against anything, and keeping it would inflate the
    // count the evidence model reads as "the catalogue lists applications".
    expect(extractApplicability([{ description: 'something' }])).toEqual([]);
  });

  it('survives rubbish', () => {
    expect(extractApplicability(null)).toEqual([]);
    expect(extractApplicability('nope')).toEqual([]);
  });
});
