/**
 * Reading the provider's OEM applicability answer.
 *
 * ## The rule this file exists to hold
 *
 * The endpoint returns "vehicles compatible with this OEM part". It does NOT
 * document that set as exhaustive, and we have not proven it is. So:
 *
 *   resolved vehicle IS in the set        → confirmed
 *   resolved vehicle is NOT in the set    → UNKNOWN
 *   no vehicle resolved                   → not_asked / unknown
 *
 * Absence must not become `incompatible`. Two reasons, and the second is the
 * one that decides it:
 *
 *   1. We cannot distinguish "the provider says no" from "the provider did
 *      not list it" without a documented exhaustiveness guarantee.
 *   2. A red DOES NOT FIT on parts that actually fit is worse than silence.
 *      Shops learn within a week that the red label is noise, and then it is
 *      worth nothing on the day it is right.
 *
 * `incompatible` therefore requires an AFFIRMATIVE contradiction, and this
 * provider's applicability endpoint does not currently express one. The path
 * is implemented so that when a documented exclusion signal exists, it has
 * somewhere to go — not so that we can infer one.
 */
import { safeText } from '../normalize';
import type { ApplicabilityAnswer } from './fitmentTruth';

/** One vehicle row from the applicability response, loosely typed. */
export interface ApplicabilityRow {
  vehicleId?: number | string;
  carId?: number | string;
  typeId?: number | string;
  manufacturerName?: string;
  modelName?: string;
  description?: string;
  yearFrom?: number | string;
  yearTo?: number | string;
  [key: string]: unknown;
}

export interface ApplicabilityResult {
  answer: ApplicabilityAnswer;
  /** How many vehicles the provider listed for this OEM + manufacturer. */
  listed: number;
  /** True when our resolved vehicle id appeared in that list. */
  matchedResolvedVehicle: boolean;
  detail: string;
}

function rowVehicleId(row: ApplicabilityRow): number | null {
  const raw = row.vehicleId ?? row.carId;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * How a resolved variant is recognised in an applicability response.
 *
 * ## The finding that forced this
 *
 * The live applicability endpoint returns NO vehicle id. Observed 2026-08-24:
 * 370 rows for a Mercedes brake-pad OEM, each
 *
 *   { manufacturerName, modelName, typeEngineName, bodyType,
 *     constructionIntervalStart, constructionIntervalEnd, powerKw, powerPs }
 *
 * and not one identifier among them. Matching on `vehicleId` — which is what
 * this module did — could therefore never succeed, and every part on every
 * vehicle would have come back UNKNOWN forever. It would have looked like
 * caution and been a bug.
 *
 * So a variant is matched on the tuple the provider actually publishes:
 * model series AND engine-type name. Both, together — `typeEngineName` alone
 * repeats across series ("350 CDI" exists under several), and `modelName`
 * alone is the whole series rather than one variant.
 */
export interface ResolvedVariantIdentity {
  vehicleId?: number;
  modelName?: string;
  typeEngineName?: string;
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function rowMatchesVariant(row: ApplicabilityRow, want: ResolvedVariantIdentity): boolean {
  // An id, if the provider ever supplies one.
  const id = rowVehicleId(row);
  if (id !== null && want.vehicleId !== undefined) return id === want.vehicleId;

  if (!want.modelName || !want.typeEngineName) return false;

  const model = norm(row.modelName);
  const engine = norm(row.typeEngineName);
  if (!model || !engine) return false;

  return model === norm(want.modelName) && engine === norm(want.typeEngineName);
}

export function extractApplicabilityRows(payload: unknown): ApplicabilityRow[] {
  if (Array.isArray(payload)) return payload as ApplicabilityRow[];
  for (const key of ['data', 'items', 'vehicles', 'cars', 'result']) {
    const v = (payload as Record<string, unknown>)?.[key];
    if (Array.isArray(v)) return v as ApplicabilityRow[];
  }
  return [];
}

/**
 * Decide what the provider told us about this part on this vehicle.
 *
 * `resolvedVehicleId` undefined means we never pinned the vehicle to one
 * modification — so there is nothing to look for in the list, and the answer
 * is `unknown` however many rows came back. A list of vehicles this part fits
 * is not evidence about a vehicle we could not identify.
 */
export function normalizeApplicability(
  payload: unknown,
  resolved: number | ResolvedVariantIdentity | undefined,
): ApplicabilityResult {
  const rows = extractApplicabilityRows(payload);
  const listed = rows.length;

  const want: ResolvedVariantIdentity | undefined =
    typeof resolved === 'number' ? { vehicleId: resolved } : resolved;

  // Nothing to look for: either no variant was resolved, or the one we have
  // carries neither an id nor the descriptive pair the provider publishes.
  const identifiable = Boolean(
    want && (want.vehicleId !== undefined || (want.modelName && want.typeEngineName)),
  );

  if (!identifiable) {
    return {
      answer: 'unknown',
      listed,
      matchedResolvedVehicle: false,
      detail: listed
        ? `The catalogue lists ${listed} vehicle${listed === 1 ? '' : 's'} for this part, but this `
          + 'estimate is not resolved to one catalogue variant, so none of them can be matched to it.'
        : 'No vehicle applicability was returned for this part number.',
    };
  }

  const matched = rows.some(r => rowMatchesVariant(r, want!));

  if (matched) {
    return {
      answer: 'confirmed',
      listed,
      matchedResolvedVehicle: true,
      detail: 'The catalogue lists this part for the resolved vehicle variant.',
    };
  }

  // The important branch. NOT `incompatible`.
  return {
    answer: 'unknown',
    listed,
    matchedResolvedVehicle: false,
    detail: listed
      ? `The catalogue lists ${listed} vehicle${listed === 1 ? '' : 's'} for this part and this `
        + 'variant is not among them. The provider does not state that list is complete, '
        + 'so this is not a statement that the part does not fit.'
      : 'The catalogue returns no vehicle applicability for this part number.',
  };
}

/**
 * The escape hatch for a documented exclusion, deliberately unused.
 *
 * If AutoPartsAPI ever publishes an affirmative "does not fit" signal, it maps
 * here and `fitmentTruth` turns it into `incompatible`. Until then nothing
 * calls this, and a test asserts that no code path reaches `excluded` by
 * inference.
 */
export function explicitExclusion(reason: string): ApplicabilityResult {
  return {
    answer: 'excluded',
    listed: 0,
    matchedResolvedVehicle: false,
    detail: safeText(reason, 200) ?? 'The catalogue explicitly excludes this vehicle.',
  };
}
