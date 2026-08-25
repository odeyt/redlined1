/**
 * Resolving a Redlined1 vehicle to a provider's idea of the same vehicle.
 *
 * ## The distinction this whole module exists to protect
 *
 * Two questions, answered separately and never allowed to answer each other:
 *
 *   PART IDENTITY   is this article the part the OEM number names?
 *   VEHICLE FITMENT does the provider say this part goes on THIS vehicle?
 *
 * A part can be a perfect identity match and have no known fitment. That is
 * not a failure and not a degraded result — it is the accurate answer, and
 * the UI shows both fields because collapsing them into one percentage would
 * make the safe case indistinguishable from the dangerous one.
 *
 * ## Provider ids stay here
 *
 * `manufacturerId`, `modelId`, `vehicleId` and `typeId` are AutoPartsAPI's
 * words for things Redlined1 already has its own words for. They live in this
 * module and in the mapping table; nothing in the estimate, the invoice or
 * the vehicle record learns them. Redlined1's canonical vehicle id remains
 * the only identity the rest of the app knows.
 */

export type VehicleResolutionStatus =
  | 'resolved'           // one provider modification, unambiguously
  | 'ambiguous'          // several legitimate candidates survived
  | 'insufficient_data'  // Redlined1 does not hold enough to ask
  | 'not_found';         // the provider does not list this vehicle

/**
 * Why a resolution step concluded what it did.
 *
 * Recorded rather than summarised: when a technician asks why their Tacoma
 * resolved to one modification and not another, the answer has to be
 * inspectable, and when it resolves to nothing the reason has to name the
 * field that was missing.
 */
export interface VehicleResolutionEvidence {
  step: 'manufacturer' | 'model' | 'modification' | 'vin' | 'cache';
  outcome: 'matched' | 'ambiguous' | 'missing_input' | 'no_match' | 'reused';
  /** Shown to a technician. Never a raw payload, never a credential. */
  detail: string;
  /** How many provider candidates survived this step, where meaningful. */
  candidates?: number;
}

export interface ProviderVehicleResolution {
  provider: 'autopartsapi';
  redlinedVehicleId: string;

  typeId?: number;
  manufacturerId?: number;
  modelId?: number;
  vehicleId?: number;

  manufacturerName?: string;
  modelName?: string;
  modificationDescription?: string;

  resolutionStatus: VehicleResolutionStatus;
  evidence: VehicleResolutionEvidence[];

  /**
   * Which vehicle attributes produced this mapping.
   *
   * A cached provider id is only valid for the vehicle it was resolved from.
   * Change the engine and it is a different vehicle to a parts catalogue,
   * whatever the row id says.
   */
  fingerprint: string;

  resolvedAt: string;

  /** Set when a technician chose among candidates rather than the resolver. */
  confirmedByUserId?: string;
}

/**
 * A provider MODEL SERIES a technician may be asked to choose between.
 *
 * Distinct from a modification. A 2009 Mercedes-Benz S-Class matches two
 * catalogue series for that year, and neither is a variant of the other —
 * choosing one narrows which variants exist at all. Model ambiguity therefore
 * produces no modification candidates, which is why the variant chooser could
 * not help and the technician saw nothing.
 *
 * Carries only what distinguishes one series from another on screen. A
 * technician picking between "S-CLASS (W221)" and "S-CLASS Coupe (C216)" needs
 * the name and the years it was built, and nothing else.
 */
export interface ModelSeriesCandidate {
  modelId: number;
  name: string;
  yearFrom?: number;
  yearTo?: number;
}

/** A provider modification a technician may be asked to choose between. */
export interface ModificationCandidate {
  vehicleId: number;
  description: string;
  /**
   * The series name as the PROVIDER writes it on this row.
   *
   * Carried because the applicability endpoint returns no vehicle id, so a
   * variant is recognised there by (modelName, typeEngineName). Both must come
   * from provider rows or the comparison is between two different vocabularies
   * — the variants envelope's own `modelType` field returned "PC" live, not a
   * series name at all.
   */
  modelName?: string;
  yearFrom?: number;
  yearTo?: number;
  engineCode?: string;
  displacementL?: number;
  /** The provider publishes this directly, so it is not parsed out of prose. */
  cylinders?: number;
  fuel?: string;
  powerKw?: number;
  bodyType?: string;
  driveType?: string;
  transmission?: string;
}

/**
 * The Redlined1 side of the question — only fields the vehicles table has.
 *
 * `trim` is present in the schema and empty in all 114 production rows, and
 * `engine` is filled in 6. The resolver is built for that reality: it must
 * behave well on a vehicle described only as "2014 Mercedes-Benz S-Class",
 * because that is what most of them are.
 */
export interface CanonicalVehicle {
  id: string;
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  engine?: string;
  transmission?: string;
  fuelType?: string;
}
