/**
 * Every AutoPartsAPI path Redlined1 knows, in one place.
 *
 * Transcribed from the provider's current official documentation. Nothing here
 * is inferred: a path that is not in the docs is not in this file, and the
 * previous `AUTOPARTS_SEARCH_PATH` escape hatch is gone now that the real
 * endpoints are confirmed — a guessed path in an environment variable was only
 * ever a placeholder for this.
 *
 * Paths are built by helpers rather than assembled at call sites, so a path
 * segment can never be interpolated unvalidated. Numeric ids go through
 * `idSegment`; free-text values like an OEM number go through
 * `oemSegment`/query encoding.
 */
import { idSegment } from './client';

/**
 * English.
 *
 * Documented by the provider as `langId=4`. Recorded as a constant with that
 * evidence — §7 of the brief permits it, and resolving a static value on every
 * search would spend a free-tier call to rediscover a documented fact.
 *
 * `resolveLocale()` in client.ts still exists and still verifies this against
 * `/languages/list`; it is the check, not the source.
 */
export const AUTOPARTS_ENGLISH_LANG_ID = 4;

/**
 * The provider's catalogue MARKET filter, documented as Germany.
 *
 * It is NOT the user's country, and naming it `countryFilterId` in provider
 * terms rather than "country" in ours is deliberate — a shop in Laos using a
 * German market catalogue is normal, because the catalogue describes parts,
 * not shipping. Passed only where an endpoint requires it.
 */
export const AUTOPARTS_DEFAULT_COUNTRY_FILTER_ID = 63;

/**
 * The provider's vehicle-type ids.
 *
 * Confined to this adapter on purpose. Redlined1 has its own idea of a
 * vehicle and must not learn that a Tacoma is "type 1" to a third party —
 * that is exactly the coupling the provider abstraction exists to prevent.
 */
export const AUTOPARTS_TYPE_ID = {
  passengerCar: 1,
  commercialVehicle: 2,
  motorbike: 3,
} as const;

export type RedlineVehicleType = 'car' | 'truck' | 'motorbike';

/** Redlined1's vehicle notion → the provider's. The only place they meet. */
export function toAutoPartsTypeId(type: RedlineVehicleType): number {
  switch (type) {
    case 'truck': return AUTOPARTS_TYPE_ID.commercialVehicle;
    case 'motorbike': return AUTOPARTS_TYPE_ID.motorbike;
    // Default rather than throw: an unknown body style is a passenger car far
    // more often than it is anything else, and refusing to search would be a
    // worse answer than searching the commonest category.
    case 'car':
    default: return AUTOPARTS_TYPE_ID.passengerCar;
  }
}

/**
 * An OEM number as a PATH segment.
 *
 * Real OEM numbers carry dots and dashes ("04465-0K340", "11.42.7.508.550"),
 * all of which `SAFE_SEGMENT` already allows. Anything else — a slash, a
 * space, a percent — is refused rather than escaped, because an OEM number
 * containing a slash is not an OEM number, it is someone probing the path.
 */
export function oemSegment(oem: string): string {
  const cleaned = String(oem ?? '').trim().toUpperCase();
  if (!cleaned || cleaned.length > 60) throw new Error('invalid OEM number');
  if (!/^[A-Z0-9._-]+$/.test(cleaned)) throw new Error('invalid OEM number');
  return cleaned;
}

// ─── Documented endpoints ────────────────────────────────────────────────────

/** GET /languages/list — reference data, and the connectivity gate. */
export const LANGUAGES_LIST = 'languages/list';

// ─── Vehicle resolution chain ────────────────────────────────────────────────
//
// Verified against the provider's current public documentation, 2026-08-24.
// Each path is built by a helper so no segment is ever interpolated
// unvalidated; ids go through idSegment, which refuses anything but an
// integer in range.

/**
 * GET /manufacturers/list/type-id/{typeId}
 *
 * Essentially static catalogue reference data. Cached for a day and never
 * called per parts search — see referenceCache.ts.
 */
export function manufacturersPath(typeId = AUTOPARTS_TYPE_ID.passengerCar): string {
  return `manufacturers/list/type-id/${idSegment(typeId)}`;
}

/**
 * GET /models/list/type-id/{}/manufacturer-id/{}/lang-id/{}/country-filter-id/{}
 *
 * Model series for one manufacturer, with the provider's modelId.
 */
export function modelsPath(args: {
  manufacturerId: number;
  typeId?: number;
  langId?: number;
  countryFilterId?: number;
}): string {
  return 'models/list'
    + `/type-id/${idSegment(args.typeId ?? AUTOPARTS_TYPE_ID.passengerCar)}`
    + `/manufacturer-id/${idSegment(args.manufacturerId)}`
    + `/lang-id/${idSegment(args.langId ?? AUTOPARTS_ENGLISH_LANG_ID)}`
    + `/country-filter-id/${idSegment(args.countryFilterId ?? AUTOPARTS_DEFAULT_COUNTRY_FILTER_ID)}`;
}

/**
 * GET /types/type-id/{}/list-vehicles-types/{modelId}/lang-id/{}/country-filter-id/{}
 *
 * The ENGINE-SPEC variant, deliberately. The provider also offers
 * `list-vehicles-id`, which returns variants without engine data — and with
 * engine recorded on 6 of 114 Redlined1 vehicles, the provider's own
 * displacement, cylinders, kW and engine codes are the only way a technician
 * can tell two variants apart. The cheaper endpoint would make the variant
 * selector a list of identical-looking rows.
 */
export function vehicleVariantsPath(args: {
  modelId: number;
  typeId?: number;
  langId?: number;
  countryFilterId?: number;
}): string {
  return `types/type-id/${idSegment(args.typeId ?? AUTOPARTS_TYPE_ID.passengerCar)}`
    + `/list-vehicles-types/${idSegment(args.modelId)}`
    + `/lang-id/${idSegment(args.langId ?? AUTOPARTS_ENGLISH_LANG_ID)}`
    + `/country-filter-id/${idSegment(args.countryFilterId ?? AUTOPARTS_DEFAULT_COUNTRY_FILTER_ID)}`;
}

/**
 * GET /types/type-id/{}/vehicle-type-details/{vehicleId}/lang-id/{}/country-filter-id/{}
 *
 * Full technical detail for ONE variant. Called only when a variant needs
 * more detail than the list gave — never once per candidate, which on a model
 * with a dozen variants would spend a dozen calls to render a picker.
 */
export function vehicleDetailPath(args: {
  vehicleId: number;
  typeId?: number;
  langId?: number;
  countryFilterId?: number;
}): string {
  return `types/type-id/${idSegment(args.typeId ?? AUTOPARTS_TYPE_ID.passengerCar)}`
    + `/vehicle-type-details/${idSegment(args.vehicleId)}`
    + `/lang-id/${idSegment(args.langId ?? AUTOPARTS_ENGLISH_LANG_ID)}`
    + `/country-filter-id/${idSegment(args.countryFilterId ?? AUTOPARTS_DEFAULT_COUNTRY_FILTER_ID)}`;
}

/**
 * Primary OEM search.
 * GET /articles-oem/search-by-article-oem-no?langId=&articleOemNo=
 */
export const SEARCH_BY_OEM = 'articles-oem/search-by-article-oem-no';

export function searchByOemQuery(oem: string, langId = AUTOPARTS_ENGLISH_LANG_ID) {
  return { langId: String(idSegment(langId)), articleOemNo: oemSegment(oem) };
}

/**
 * Equivalent / equal OEM references.
 * GET /articles-oem/search-all-equal-oem-no/lang-id/{langId}/article-oem-no/{oem}
 */
export function equalOemPath(oem: string, langId = AUTOPARTS_ENGLISH_LANG_ID): string {
  return `articles-oem/search-all-equal-oem-no/lang-id/${idSegment(langId)}`
    + `/article-oem-no/${oemSegment(oem)}`;
}

/**
 * Vehicles associated with an OEM number — the only endpoint here that can
 * support a VERIFIED FIT, and only against the estimate's own vehicle.
 *
 * GET /articles-oem/selecting-a-list-of-cars-for-oem-part-number
 *     /type-id/{typeId}/lang-id/{langId}/country-filter-id/{countryFilterId}
 *     /manufacturer-id/{manufacturerId}/article-oem-no/{oem}
 */
export function vehicleApplicabilityPath(args: {
  typeId: number;
  manufacturerId: number;
  oem: string;
  langId?: number;
  countryFilterId?: number;
}): string {
  const langId = args.langId ?? AUTOPARTS_ENGLISH_LANG_ID;
  const countryFilterId = args.countryFilterId ?? AUTOPARTS_DEFAULT_COUNTRY_FILTER_ID;
  return 'articles-oem/selecting-a-list-of-cars-for-oem-part-number'
    + `/type-id/${idSegment(args.typeId)}`
    + `/lang-id/${idSegment(langId)}`
    + `/country-filter-id/${idSegment(countryFilterId)}`
    + `/manufacturer-id/${idSegment(args.manufacturerId)}`
    + `/article-oem-no/${oemSegment(args.oem)}`;
}

/**
 * OEM parts for a KNOWN vehicle by search term. Requires resolved vehicle ids,
 * which Redlined1 does not hold yet — see the note in provider.ts.
 *
 * GET /articles-oem/selecting-oem-parts-vehicle-modification-description-product-group
 *     /type-id/{typeId}/vehicle-id/{vehicleId}/lang-id/{langId}/search-param/{term}
 */
export function oemPartsForVehiclePath(args: {
  typeId: number;
  vehicleId: number;
  searchParam: string;
  langId?: number;
}): string {
  const langId = args.langId ?? AUTOPARTS_ENGLISH_LANG_ID;
  return 'articles-oem/selecting-oem-parts-vehicle-modification-description-product-group'
    + `/type-id/${idSegment(args.typeId)}`
    + `/vehicle-id/${idSegment(args.vehicleId)}`
    + `/lang-id/${idSegment(langId)}`
    + `/search-param/${searchTermSegment(args.searchParam)}`;
}

/**
 * A technician's search term, as a path segment.
 *
 * The earlier version refused anything with a space, which meant it refused
 * "front brake pads" — the single most likely thing anyone types. That is not
 * a safety rule, it is a broken feature wearing one.
 *
 * So the term is VALIDATED and then ENCODED, rather than rejected. Validation
 * removes what could change the shape of the URL — a slash, a backslash, a
 * query, a fragment, a percent, a control character. Encoding then makes the
 * survivors safe to carry. Spaces and ordinary punctuation are fine once
 * encoded; a slash never is, at any encoding, because `buildProviderUrl`
 * splits on it and a smuggled one becomes a path segment of its own.
 */
export function searchTermSegment(raw: string): string {
  const term = String(raw ?? '').trim();
  if (!term) throw new Error('search term is empty');
  if (term.length > 60) throw new Error('search term too long');

  // Path characters by literal, control characters by code point — no
  // control-character regex, which is the thing lint objects to and which is
  // harder to read than the comparison it replaces.
  if (/[/\\?#%]/.test(term) || [...term].some(c => (c.codePointAt(0) ?? 0) < 0x20)) {
    throw new Error('search term contains a path character');
  }

  return encodeURIComponent(term);
}

// ─── Cross-reference ─────────────────────────────────────────────────────────

/** Aftermarket parts carrying an OEM cross-reference. */
export function aftermarketCrossRefPath(oem: string): string {
  return 'artlookup/search-for-the-oem-cross-references-through-aftermarket-parts-references'
    + `/article-oem-no/${oemSegment(oem)}`;
}

/** Provider-declared analogues. Weaker evidence than a cross-reference. */
export function analoguesPath(oem: string): string {
  return `artlookup/search-for-analogue-of-spare-parts-by-oem-number/article-oem-no/${oemSegment(oem)}`;
}

/** Cross references for an article we already have an id for. */
export function articleCrossRefPath(articleId: number, langId = AUTOPARTS_ENGLISH_LANG_ID): string {
  return `artlookup/select-article-cross-references/article-id/${idSegment(articleId)}`
    + `/lang-id/${idSegment(langId)}`;
}

/** GET /artlookup/search-articles-by-article-no?articleNo=&langId= */
export const SEARCH_BY_ARTICLE_NO = 'artlookup/search-articles-by-article-no';

export function searchByArticleNoQuery(articleNo: string, langId = AUTOPARTS_ENGLISH_LANG_ID) {
  const cleaned = String(articleNo ?? '').trim().toUpperCase();
  if (!cleaned || cleaned.length > 60) throw new Error('invalid article number');
  return { articleNo: cleaned, langId: String(idSegment(langId)) };
}

/**
 * Partial / fuzzy match. DISCOVERY ONLY.
 *
 * §12: a partial-match result may never independently establish equivalence or
 * fitment. String similarity is a way to find candidates, not a way to be
 * right about them, and the evidence model treats it accordingly.
 */
export const SEARCH_PARTIAL = 'artlookup/select-article-cross-references-partial-match';

export function searchPartialQuery(articleNo: string, langId = AUTOPARTS_ENGLISH_LANG_ID) {
  return searchByArticleNoQuery(articleNo, langId);
}
