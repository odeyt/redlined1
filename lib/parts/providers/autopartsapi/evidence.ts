/**
 * What kind of evidence we actually have that two part numbers are the same
 * part — and whether any of it says the part fits the vehicle in the bay.
 *
 * The provider offers six different answers and they are NOT interchangeable.
 * Collapsing them into one boolean is the mistake this module exists to make
 * impossible: an analogue is a supplier's opinion, a partial match is a string
 * that looked similar, and a vehicle applicability record is the only thing
 * here that speaks about a vehicle at all.
 *
 * ## Two separate questions
 *
 *   Is this the same PART?      → equivalence, from identifier evidence
 *   Does it fit THIS VEHICLE?   → fitment, from applicability evidence ONLY
 *
 * They are computed independently and neither may be inferred from the other.
 * A perfect OEM match on a part for a different model year is still the wrong
 * part, and no amount of identifier evidence changes that.
 */
import type { FitmentStatus } from '../../types';

/** Ordered strongest first. The order is the point. */
export type EvidenceKind =
  | 'exact_oem'              // the OEM search returned this article for the number asked
  | 'equal_oem'              // provider lists it as an equal OEM reference
  | 'cross_reference'        // explicit provider aftermarket cross-reference
  | 'vehicle_applicability'  // provider links the OEM number to a vehicle
  | 'mpn_relation'           // manufacturer part number matches exactly
  | 'analogue'               // provider says "analogue/equivalent candidate"
  | 'partial_match';         // string similarity. DISCOVERY ONLY.

export interface EvidenceItem {
  kind: EvidenceKind;
  /** Human-readable, shown to the technician. Never a raw payload. */
  detail: string;
  /** The provider endpoint family this came from, for auditability. */
  source: 'articles-oem' | 'artlookup';
}

/**
 * How sure we are that this article IS the part identified by the OEM number.
 *
 * Separate from fitment, and deliberately not a number. `verified_equivalent`
 * requires authoritative evidence — an exact OEM hit, an equal-OEM
 * confirmation, or an explicit cross-reference. A score threshold can never
 * produce it, however many weak signals pile up, because ten weak signals are
 * not one strong one.
 */
export type EquivalenceLevel =
  | 'verified_equivalent'
  | 'cross_referenced'
  | 'analogue_candidate'
  | 'discovery_only';

export const EQUIVALENCE_LABEL: Record<EquivalenceLevel, string> = {
  verified_equivalent: 'VERIFIED EQUIVALENT',
  cross_referenced: 'CROSS-REFERENCE CONFIRMED',
  analogue_candidate: 'ANALOGUE',
  discovery_only: 'PARTIAL MATCH',
};

/**
 * Evidence that can, on its own, establish equivalence — the provider making
 * an explicit statement about identity rather than a suggestion.
 *
 * Exported so a test can assert the membership directly. Adding a kind here is
 * the single decision that widens what may be called equivalent, which is
 * exactly the change that should be hard to make by accident.
 */
export const AUTHORITATIVE_EVIDENCE: readonly EvidenceKind[] =
  ['exact_oem', 'equal_oem', 'cross_reference'];

export function hasAuthoritativeEvidence(evidence: EvidenceItem[]): boolean {
  return evidence.some(e => AUTHORITATIVE_EVIDENCE.includes(e.kind));
}

export function equivalenceFrom(evidence: EvidenceItem[]): EquivalenceLevel {
  const kinds = new Set(evidence.map(e => e.kind));

  // Nothing authoritative means nothing can be called equivalent, whatever
  // else is present.
  if (!hasAuthoritativeEvidence(evidence)) {
    return kinds.has('analogue') ? 'analogue_candidate' : 'discovery_only';
  }

  // An exact hit or an equal-OEM confirmation is the strongest identifier
  // statement the provider makes.
  if (kinds.has('exact_oem') || kinds.has('equal_oem')) return 'verified_equivalent';
  if (kinds.has('cross_reference')) return 'cross_referenced';

  // A partial match, an MPN relation with nothing behind it, or nothing at
  // all. All discovery.
  return 'discovery_only';
}

/**
 * Whether a partial match is doing work it is not allowed to do.
 *
 * Exported so a test can assert the rule directly rather than inferring it
 * from an outcome: a set of evidence containing ONLY partial matches must
 * never reach `verified_equivalent` or a verified fitment.
 */
export function isDiscoveryOnly(evidence: EvidenceItem[]): boolean {
  if (!evidence.length) return true;
  return evidence.every(e => e.kind === 'partial_match' || e.kind === 'mpn_relation');
}

// ─── Fitment ─────────────────────────────────────────────────────────────────

export interface VehicleApplicability {
  /** As the provider names them. Compared case-insensitively. */
  manufacturer?: string;
  model?: string;
  /** Production window, when the provider gives one. */
  yearFrom?: number;
  yearTo?: number;
  description?: string;
}

export interface EstimateVehicle {
  make?: string;
  model?: string;
  year?: number;
}

function textMatches(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * Fitment for THIS vehicle, from applicability records only.
 *
 * `verified` requires the make AND model to match a returned record, and the
 * estimate's year to fall inside that record's production window when one is
 * given. Anything short of that is `likely` at best.
 *
 * A year outside the window is NOT `incompatible`: the provider's window
 * describes the vehicles it lists, and absence of a record is not a statement
 * that the part does not fit. Only an explicit provider rejection earns
 * `incompatible`, and this endpoint does not make one.
 */
export function fitmentFromApplicability(
  records: VehicleApplicability[],
  vehicle: EstimateVehicle,
): { status: FitmentStatus; reason: string } {
  if (!records.length) {
    return {
      status: 'unverified',
      reason: 'The catalogue lists no vehicle applicability for this part number.',
    };
  }

  if (!vehicle.make || !vehicle.model) {
    // We were handed applicability we cannot check anything against.
    return {
      status: 'unverified',
      reason: `Catalogue lists ${records.length} vehicle${records.length === 1 ? '' : 's'} for this part, `
        + 'but this estimate has no vehicle to check them against.',
    };
  }

  const nameMatches = records.filter(r =>
    textMatches(r.manufacturer, vehicle.make) && textMatches(r.model, vehicle.model));

  if (!nameMatches.length) {
    return {
      status: 'unverified',
      reason: `Catalogue applicability does not list ${vehicle.make} ${vehicle.model}.`,
    };
  }

  if (!vehicle.year) {
    return {
      status: 'likely',
      reason: `Catalogue lists this part for ${vehicle.make} ${vehicle.model}, `
        + 'but the estimate vehicle has no year to confirm against.',
    };
  }

  const inWindow = nameMatches.find(r => {
    const from = r.yearFrom ?? -Infinity;
    const to = r.yearTo ?? Infinity;
    return vehicle.year! >= from && vehicle.year! <= to;
  });

  if (inWindow) {
    const window = inWindow.yearFrom || inWindow.yearTo
      ? ` (${inWindow.yearFrom ?? '…'}–${inWindow.yearTo ?? 'present'})`
      : '';
    return {
      status: 'verified',
      reason: `Catalogue lists this part for ${vehicle.make} ${vehicle.model}${window}.`,
    };
  }

  return {
    status: 'likely',
    reason: `Catalogue lists this part for ${vehicle.make} ${vehicle.model}, `
      + `but not for the ${vehicle.year} model year.`,
  };
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

/**
 * Match confidence, 0–100, with ONE provider.
 *
 * The previous model awarded points for a second provider agreeing. There is
 * no second catalogue, so that component is removed rather than quietly
 * reassigned — leaving it would let a single source score as though two
 * agreed, which is precisely the false corroboration §13 forbids.
 *
 * Weights sum to 100 and are stated here rather than scattered:
 *
 *   exact OEM cross-reference        40
 *   vehicle applicability            30
 *   exact MPN / manufacturer relation 15
 *   equal OEM confirmation           10
 *   provider analogue evidence        5
 *
 * A partial match is worth ZERO. It is how a candidate was found, not a
 * reason to believe it.
 */
export const MATCH_WEIGHTS: Record<EvidenceKind, number> = {
  exact_oem: 40,
  cross_reference: 40,
  vehicle_applicability: 30,
  mpn_relation: 15,
  equal_oem: 10,
  analogue: 5,
  partial_match: 0,
};

export const MAX_MATCH_SCORE = 100;

export function matchScore(evidence: EvidenceItem[]): number {
  // Each KIND counts once. Ten cross-reference rows are one cross-reference
  // fact, and counting them individually would let a chatty endpoint
  // manufacture confidence.
  const kinds = new Set(evidence.map(e => e.kind));

  // exact_oem and cross_reference both weigh 40 and say nearly the same thing;
  // holding both must not total 80.
  let score = 0;
  if (kinds.has('exact_oem') || kinds.has('cross_reference')) score += MATCH_WEIGHTS.exact_oem;
  if (kinds.has('vehicle_applicability')) score += MATCH_WEIGHTS.vehicle_applicability;
  if (kinds.has('mpn_relation')) score += MATCH_WEIGHTS.mpn_relation;
  if (kinds.has('equal_oem')) score += MATCH_WEIGHTS.equal_oem;
  if (kinds.has('analogue')) score += MATCH_WEIGHTS.analogue;

  return Math.min(MAX_MATCH_SCORE, score);
}

/** The complete verdict for one catalogue article. */
export interface MatchVerdict {
  evidence: EvidenceItem[];
  equivalence: EquivalenceLevel;
  score: number;
  fitmentStatus: FitmentStatus;
  fitmentReason: string;
  /** Single-source, and the UI says so rather than implying corroboration. */
  singleSource: true;
}

export function buildVerdict(args: {
  evidence: EvidenceItem[];
  applicability: VehicleApplicability[];
  vehicle: EstimateVehicle;
}): MatchVerdict {
  const fit = fitmentFromApplicability(args.applicability, args.vehicle);

  // Discovery-only evidence cannot carry a fitment claim, whatever the
  // applicability lookup said — if the article was found by string similarity
  // we do not know it is the right part to be checking applicability for.
  const discoveryOnly = isDiscoveryOnly(args.evidence);
  const fitmentStatus: FitmentStatus = discoveryOnly && fit.status === 'verified'
    ? 'likely'
    : fit.status;
  const fitmentReason = discoveryOnly && fit.status === 'verified'
    ? fit.reason + ' Found by partial match, so the part identity is not confirmed.'
    : fit.reason;

  return {
    evidence: args.evidence,
    equivalence: equivalenceFrom(args.evidence),
    score: matchScore(args.evidence),
    fitmentStatus,
    fitmentReason,
    singleSource: true,
  };
}
