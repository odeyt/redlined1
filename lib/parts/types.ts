/**
 * Parts Intelligence — the canonical shapes every provider is flattened into.
 *
 * The rule this file exists to enforce: no provider's raw response ever
 * reaches a component. eBay's `itemSummaries[].shippingOptions[0]` and
 * Amazon's `Offers.Listings[0].Price` are different words for the same thing,
 * and a UI that knows either one is a UI that has to be rewritten for the
 * third provider. Everything crosses this boundary as NormalizedPartResult.
 *
 * The second rule is about fitment, and it is a safety rule rather than an
 * architectural one. A wrong brake pad is not a bad search result; it is a
 * vehicle that does not stop. `verified` therefore means a provider stated
 * compatibility for this vehicle — never that a keyword matched, never that a
 * model implied it. See `fitment.ts`.
 */

/**
 * Every provider the architecture admits, including ones with no
 * implementation. Listing a future provider here is deliberate: it makes the
 * registry exhaustive at compile time, so adding a provider cannot be done by
 * quietly bolting a fetch call into a component.
 */
export type PartsProviderId =
  | 'ebay'
  | 'amazon'
  | 'catalog'
  | 'rockauto'
  | 'partsgeek'
  | 'ssg'
  | 'partstech'
  | 'napa'
  | 'local_supplier';

/**
 * Why a provider is not returning results.
 *
 * `pending_authorized_access` is the important one. RockAuto, PartsGeek, SSG
 * and NAPA have no public parts API. They are represented as registry entries
 * that are OFF and say why, rather than as scrapers. Scraping them would be
 * unauthorised, would break without warning, and would put fabricated fitment
 * in front of a technician.
 */
export type ProviderStatus =
  | 'ready'
  | 'missing_credentials'
  | 'pending_authorized_access'
  | 'disabled_by_config'
  | 'future';

export interface ProviderHealth {
  id: PartsProviderId;
  name: string;
  enabled: boolean;
  status: ProviderStatus;
  /** Shown to the technician verbatim. Must never contain a secret. */
  reason?: string;
}

/**
 * How confident we are that this part fits THIS vehicle.
 *
 * Deliberately four states rather than a boolean or a percentage. A boolean
 * forces every unknown into one of two lies, and a percentage invites someone
 * to invent 0.7.
 */
export type FitmentStatus =
  | 'verified'      // the provider stated compatibility for this vehicle
  | 'likely'        // OEM/MPN cross-reference matched; vehicle fit not stated
  | 'unverified'    // a search result, nothing more
  | 'incompatible'; // the provider explicitly said no

/** How complete a landed cost is. A total with unknown parts must say so. */
export type LandedCostCompleteness = 'complete' | 'partial' | 'unknown';

export interface NormalizedPartResult {
  provider: PartsProviderId;
  providerListingId?: string;

  title: string;
  description?: string;

  brand?: string;
  manufacturerPartNumber?: string;
  oemNumbers?: string[];

  imageUrl?: string;
  productUrl?: string;
  /** Only ever populated when a partner configuration genuinely exists. */
  affiliateUrl?: string;

  currency: string;

  itemPrice?: number;
  shippingCost?: number;
  /** null means "not known", which is NOT the same as zero. */
  estimatedTax?: number | null;
  estimatedImportDuty?: number | null;
  landedCost?: number;
  landedCostCompleteness?: LandedCostCompleteness;

  availability?: string;
  condition?: string;

  sellerName?: string;
  /** Normalised to 0–1 across providers, whatever scale the source used. */
  sellerRating?: number;

  estimatedDeliveryStart?: string;
  estimatedDeliveryEnd?: string;

  warranty?: string;

  /**
   * The vehicle marque a catalogue row belongs to — NOT the part's brand.
   *
   * Surfaced because OEM numbers collide across marques: searching Toyota's
   * 04465-0K340 returns rows filed under CHRYSLER and FORD too. Without this
   * on the card, a technician looking at a Mercedes estimate cannot tell
   * whether a row has anything to do with their vehicle, and neither can
   * anyone reviewing the screen. Absent for marketplace providers, which
   * describe an offer rather than a catalogue position.
   */
  vehicleManufacturer?: string;

  fitmentStatus: FitmentStatus;
  fitmentReason?: string;

  /** ISO timestamp. Drives "checked 4 minutes ago" — never implies live. */
  sourceCheckedAt: string;
}

export interface PartsSearchInput {
  /**
   * The shop the search is for.
   *
   * Carried so provider calls can be attributed in usage accounting. Never
   * used to scope catalogue data — the catalogue is public reference data and
   * identical for every tenant.
   */
  shopId?: string;

  query: string;

  vin?: string;

  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  engine?: string;

  oemNumber?: string;
  manufacturerPartNumber?: string;

  currency?: string;
  country?: string;
}

export interface PartsProvider {
  id: PartsProviderId;
  name: string;
  /** False whenever credentials or authorisation are absent. Never throws. */
  enabled(): boolean;
  health(): ProviderHealth;
  searchParts(input: PartsSearchInput): Promise<NormalizedPartResult[]>;
  getPart?(input: { providerListingId: string }): Promise<NormalizedPartResult | null>;
}

/** One provider's outcome. A failure here must not fail the whole search. */
export interface ProviderOutcome {
  provider: PartsProviderId;
  ok: boolean;
  /** Safe for display. Never a stack trace, never a credential. */
  message?: string;
  count: number;
  /** True when served from cache — the UI must not imply live pricing. */
  cached?: boolean;
}

export interface PartsSearchResponse {
  results: NormalizedPartResult[];
  providers: ProviderHealth[];
  outcomes: ProviderOutcome[];
  /** ISO. When every provider is off this is still set, and results is []. */
  searchedAt: string;
}
