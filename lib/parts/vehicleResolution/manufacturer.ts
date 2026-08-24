/**
 * Matching Redlined1's `make` to a provider manufacturer.
 *
 * ## Why this is not fuzzy matching
 *
 * "Toyota" must never resolve to "Lexus". They are one company, they share
 * engineering, and they are entirely separate parts catalogues — a fuzzy
 * matcher with a similarity threshold will eventually put a Lexus caliper on
 * a Tacoma, and it will do so with a high score.
 *
 * So matching is exact after normalisation, plus a SHORT, EXPLICIT alias list.
 * An alias is a different spelling of the same marque, never a related marque.
 * Adding one is a deliberate edit to a table somebody reviews, not an emergent
 * property of a string distance.
 */

/**
 * Different spellings of the same marque.
 *
 * Every entry is the SAME manufacturer written differently — an abbreviation,
 * a punctuation variant, or a colloquial name. Nothing here maps one marque to
 * another.
 */
const ALIASES: Record<string, string> = {
  // Abbreviations and colloquial names.
  vw: 'volkswagen',
  chevy: 'chevrolet',
  merc: 'mercedesbenz',
  mercedes: 'mercedesbenz',
  benz: 'mercedesbenz',
  bimmer: 'bmw',
  beemer: 'bmw',
  vauxhall: 'opel',
  // Marques the catalogue may spell as one word or two. Normalisation already
  // strips punctuation, so these cover the remaining word-order/spelling gaps.
  landrover: 'landrover',
  rangerover: 'landrover',
  alfa: 'alfaromeo',
  gm: 'generalmotors',
};

/**
 * Marques that are commonly confused and must NEVER alias to each other.
 *
 * Held as data so the rule is testable and visible rather than implied by the
 * absence of an alias. Each pair is two real, separate parts catalogues.
 */
export const NEVER_EQUIVALENT: ReadonlyArray<readonly [string, string]> = [
  ['toyota', 'lexus'],
  ['honda', 'acura'],
  ['nissan', 'infiniti'],
  ['volkswagen', 'audi'],
  ['mercedesbenz', 'chrysler'],
  ['ford', 'lincoln'],
  ['hyundai', 'kia'],
  ['mazda', 'ford'],
];

/** Lower-cased, punctuation removed. "Mercedes-Benz" -> "mercedesbenz". */
export function normalizeMarque(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Normalised, then resolved through the alias table. */
export function canonicalMarque(raw: unknown): string {
  const n = normalizeMarque(raw);
  return ALIASES[n] ?? n;
}

/**
 * Whether two marque strings name the same manufacturer.
 *
 * Exact after normalisation and aliasing. No edit distance, no prefix rule —
 * a prefix rule alone would make "merc" match "mercury".
 */
export function sameMarque(a: unknown, b: unknown): boolean {
  const x = canonicalMarque(a);
  const y = canonicalMarque(b);
  if (!x || !y) return false;
  return x === y;
}

/** A provider manufacturer row, in whatever shape it arrives. */
export interface ProviderManufacturer {
  id: number;
  name: string;
}

export interface ManufacturerMatch {
  status: 'matched' | 'ambiguous' | 'no_match' | 'missing_input';
  manufacturer?: ProviderManufacturer;
  /** Every provider row that matched, when more than one did. */
  candidates?: ProviderManufacturer[];
  detail: string;
}

/**
 * Pick the provider manufacturer for a Redlined1 make.
 *
 * Ambiguity is reported rather than resolved. If a catalogue genuinely lists
 * two manufacturers whose names both canonicalise to the estimate's make,
 * choosing one silently would be a guess wearing a result's clothes.
 */
export function matchManufacturer(
  make: unknown,
  provider: ProviderManufacturer[],
): ManufacturerMatch {
  const target = canonicalMarque(make);
  if (!target) {
    return { status: 'missing_input', detail: 'The vehicle has no make recorded.' };
  }

  const hits = provider.filter(m => canonicalMarque(m.name) === target);

  if (hits.length === 1) {
    return {
      status: 'matched',
      manufacturer: hits[0],
      detail: `Matched "${String(make)}" to catalogue manufacturer "${hits[0].name}".`,
    };
  }

  if (hits.length > 1) {
    return {
      status: 'ambiguous',
      candidates: hits,
      detail: `The catalogue lists ${hits.length} manufacturers matching "${String(make)}".`,
    };
  }

  return {
    status: 'no_match',
    detail: `The catalogue does not list a manufacturer matching "${String(make)}".`,
  };
}
