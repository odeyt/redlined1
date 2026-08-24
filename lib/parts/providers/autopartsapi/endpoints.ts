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
  const term = String(args.searchParam ?? '').trim();
  if (!term || term.length > 60 || !/^[A-Za-z0-9._-]+$/.test(term)) {
    // A multi-word search term cannot be a path segment. The caller must use
    // the query-parameter endpoints for free text.
    throw new Error('search-param must be a single safe token');
  }
  return 'articles-oem/selecting-oem-parts-vehicle-modification-description-product-group'
    + `/type-id/${idSegment(args.typeId)}`
    + `/vehicle-id/${idSegment(args.vehicleId)}`
    + `/lang-id/${idSegment(langId)}`
    + `/search-param/${term}`;
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
