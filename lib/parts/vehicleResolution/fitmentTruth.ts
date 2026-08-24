/**
 * The fitment truth table.
 *
 * One function decides `VERIFIED FIT`, and it takes three inputs: what the
 * part is, which vehicle we resolved, and what the provider said about the
 * two together. All three must be affirmative. Nothing else in the codebase
 * may produce `verified`.
 *
 * ## What cannot produce a verified fit, at any score
 *
 *   a 100/100 part identity match
 *   an exact OEM number
 *   a confirmed cross-reference
 *   an analogue relationship
 *   a matching marque
 *   a resolved vehicle with no applicability answer
 *
 * Each of those is evidence about the PART, or about the VEHICLE, and fitment
 * is a claim about the two together. The invariant the milestone turns on:
 *
 *   OEM Match Score  ≠  Vehicle Fitment
 *
 * `OEM 99/100 + UNVERIFIED` is a correct, expected, shippable result.
 *
 * ## Absence is not contradiction
 *
 * A part not appearing in an applicability list is not the provider saying it
 * does not fit — it is the provider not saying anything. `incompatible`
 * requires an affirmative exclusion. Treating silence as rejection would
 * bury correct parts under a red label, and shops would learn to ignore it.
 */
import type { FitmentStatus } from '../types';
import type { EquivalenceLevel } from '../providers/autopartsapi/evidence';
import type { VehicleResolutionStatus } from './types';

/** What the provider's applicability endpoint told us about this pairing. */
export type ApplicabilityAnswer =
  | 'confirmed'     // the provider associates this part with this modification
  | 'excluded'      // the provider affirmatively excludes it
  | 'unknown'       // nothing was returned about this pairing
  | 'ambiguous'     // several modifications, answers disagree
  | 'not_asked';    // we never got far enough to ask

export interface FitmentInputs {
  /** Whether we believe the article IS the part the number names. */
  partIdentity: EquivalenceLevel;
  /** Whether we pinned the estimate's vehicle to one provider modification. */
  vehicleResolution: VehicleResolutionStatus;
  applicability: ApplicabilityAnswer;
  /** Set when the catalogue row is filed under another marque entirely. */
  marqueContradicts?: boolean;
}

export interface FitmentVerdict {
  status: FitmentStatus;
  /** Shown verbatim. Always says which of the three inputs was the limit. */
  reason: string;
}

/** Identity strong enough to be worth a fitment claim about. */
const IDENTITY_ESTABLISHED: EquivalenceLevel[] = ['verified_equivalent', 'cross_referenced'];

export function decideFitment(input: FitmentInputs): FitmentVerdict {
  // ── Contradiction first. It overrides everything, including a 100 score. ──
  if (input.applicability === 'excluded') {
    return {
      status: 'incompatible',
      reason: 'The catalogue explicitly excludes this part for the resolved vehicle.',
    };
  }

  // A row filed under another marque cannot be verified for this vehicle
  // however the numbers line up. It is not INCOMPATIBLE — the provider has
  // not rejected it — it is simply not evidence about this vehicle.
  if (input.marqueContradicts) {
    return {
      status: 'unverified',
      reason: 'This catalogue entry belongs to a different marque, so it is not '
        + 'evidence about this vehicle. OEM numbers collide across marques.',
    };
  }

  // ── The three affirmatives ────────────────────────────────────────────────
  if (
    IDENTITY_ESTABLISHED.includes(input.partIdentity)
    && input.vehicleResolution === 'resolved'
    && input.applicability === 'confirmed'
  ) {
    return {
      status: 'verified',
      reason: 'The catalogue lists this part for the resolved vehicle modification.',
    };
  }

  // ── Everything else is unverified, and says WHICH input was the limit ─────
  //
  // Ordered by what the technician can act on. An unresolved variant is
  // something they can fix by choosing one; a provider with no answer is not.
  if (input.vehicleResolution === 'ambiguous') {
    return {
      status: 'unverified',
      reason: 'Several vehicle variants match this estimate, so fitment cannot be '
        + 'confirmed. Choose the variant to check applicability.',
    };
  }

  if (input.vehicleResolution === 'insufficient_data') {
    return {
      status: 'unverified',
      reason: 'This estimate does not record enough vehicle detail to check fitment.',
    };
  }

  if (input.vehicleResolution === 'not_found') {
    return {
      status: 'unverified',
      reason: 'The catalogue does not list this vehicle, so fitment cannot be checked.',
    };
  }

  if (!IDENTITY_ESTABLISHED.includes(input.partIdentity)) {
    // The vehicle may be perfectly resolved and the applicability confirmed —
    // but confirmed for a part we are not sure this article IS.
    return {
      status: input.applicability === 'confirmed' ? 'likely' : 'unverified',
      reason: input.applicability === 'confirmed'
        ? 'The catalogue lists a part for this vehicle, but this article has not been '
          + 'confirmed as the same part.'
        : 'The part has not been confirmed as an equivalent, and no applicability was returned.',
    };
  }

  if (input.applicability === 'ambiguous') {
    return {
      status: 'likely',
      reason: 'The catalogue gives conflicting applicability for the matching variants.',
    };
  }

  if (input.applicability === 'not_asked') {
    return {
      status: 'likely',
      reason: 'Part identity is confirmed. Vehicle applicability has not been checked.',
    };
  }

  // Identity established, vehicle resolved, provider returned nothing.
  return {
    status: 'likely',
    reason: 'Part identity is confirmed, but the catalogue returns no applicability '
      + 'for this vehicle. Absence is not a statement that it does not fit.',
  };
}

/**
 * The label a technician reads. Kept separate from the part-identity label so
 * the two can never be rendered as one number.
 */
export const FITMENT_HEADLINE: Record<FitmentStatus, string> = {
  verified: 'VERIFIED FIT',
  likely: 'LIKELY FIT',
  unverified: 'UNVERIFIED',
  incompatible: 'DOES NOT FIT',
};

/** An incompatible part is never recommended, whatever it scores. */
export function mayBeRecommended(status: FitmentStatus): boolean {
  return status !== 'incompatible';
}
