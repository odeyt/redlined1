/**
 * Deciding whether a part fits — the safety boundary of this feature.
 *
 * Everything else here is a convenience. This is not. A wrong brake pad is a
 * vehicle that does not stop, so the only thing that may produce `verified` is
 * a provider explicitly stating compatibility WITH THE VEHICLE ASKED ABOUT.
 *
 * Things that must never become `verified`:
 *
 *   - a keyword match on the listing title
 *   - the word "compatible" in free text
 *   - a provider's "possible" / "unknown" / "not applicable"
 *   - an MPN cross-reference with no vehicle attached  → that is `likely`
 *   - an LLM's opinion                                 → never called here
 *
 * This module is pure and takes no AI input by construction. The recommender
 * ranks; it cannot promote fitment.
 */
import type { FitmentStatus, PartsSearchInput } from './types';

/**
 * eBay's compatibility verdict for an item against a set of vehicle
 * properties. The API answers with one of these strings; anything else is
 * treated as unknown rather than guessed at.
 *
 * Documented values: COMPATIBLE, NOT_COMPATIBLE, UNDETERMINED.
 */
export type EbayCompatibilityMatch = string | null | undefined;

export interface FitmentVerdict {
  status: FitmentStatus;
  reason: string;
}

/** True when the caller gave us enough to ask a compatibility question. */
export function hasVehicleContext(input: PartsSearchInput): boolean {
  return Boolean(input.vin) || Boolean(input.year && input.make && input.model);
}

export function describeVehicle(input: PartsSearchInput): string {
  const parts = [input.year, input.make, input.model, input.trim, input.engine]
    .filter(Boolean)
    .join(' ');
  return parts || 'this vehicle';
}

/**
 * Map a provider's compatibility answer to our four states.
 *
 * `requestedVehicle` matters: a COMPATIBLE verdict returned for a query that
 * carried no vehicle is not about this vehicle, so it cannot be `verified`.
 * That case is real — eBay answers compatibility only when vehicle properties
 * are supplied, and a caller who omitted them would otherwise get a free
 * upgrade to verified.
 */
export function fitmentFromEbayCompatibility(
  match: EbayCompatibilityMatch,
  opts: { hasVehicleContext: boolean; vehicleLabel: string; hasMpnMatch?: boolean },
): FitmentVerdict {
  const normalized = String(match ?? '').trim().toUpperCase();

  if (normalized === 'NOT_COMPATIBLE') {
    return {
      status: 'incompatible',
      reason: `eBay reports this part does not fit ${opts.vehicleLabel}.`,
    };
  }

  if (normalized === 'COMPATIBLE') {
    if (!opts.hasVehicleContext) {
      // A verdict with nothing to verify against. Downgraded on purpose.
      return {
        status: 'unverified',
        reason: 'Compatibility was reported without vehicle details to check it against.',
      };
    }
    return {
      status: 'verified',
      reason: `eBay confirms compatibility with ${opts.vehicleLabel}.`,
    };
  }

  // UNDETERMINED, empty, or anything unrecognised.
  if (opts.hasMpnMatch) {
    return {
      status: 'likely',
      reason: 'Part number matches, but the seller has not listed vehicle compatibility.',
    };
  }

  return {
    status: 'unverified',
    reason: opts.hasVehicleContext
      ? `The seller has not listed compatibility for ${opts.vehicleLabel}.`
      : 'Search result only — no vehicle details were provided.',
  };
}

/** Ordering used for sorting and for refusing to recommend. */
export const FITMENT_RANK: Record<FitmentStatus, number> = {
  verified: 3,
  likely: 2,
  unverified: 1,
  incompatible: 0,
};

/** Anything but a stated fit carries the warning. */
export function needsFitmentWarning(status: FitmentStatus): boolean {
  return status !== 'verified';
}

export const FITMENT_WARNING = 'Verify fitment before ordering.';

export const FITMENT_LABEL: Record<FitmentStatus, string> = {
  verified: 'VERIFIED FIT',
  likely: 'LIKELY FIT',
  unverified: 'UNVERIFIED',
  incompatible: 'DOES NOT FIT',
};
