import 'server-only';

/**
 * The one path from a Redlined1 vehicle to a provider vehicle id.
 *
 * Nothing else may call the manufacturer, model or variant endpoints. Not
 * because layering is tidy, but because those calls are the budget: a UI
 * component that resolved a manufacturer on its own would be invisible in
 * review and would show up as a month that ran out on the 9th.
 *
 * ## Order matters for cost
 *
 *   fingerprint → mapping cache → manufacturer → model → variant
 *
 * The cache is consulted BEFORE anything, and a hit costs zero calls. That is
 * the difference between a shop searching four parts for one car spending
 * three calls and spending twelve.
 *
 * ## It refuses to invent a vehicle
 *
 * Every step can end in `ambiguous`, `insufficient_data` or `not_found`, and
 * each is returned with the candidates that survived so a technician can
 * choose. None of them is escalated into a resolution to let the workflow
 * finish.
 */
import { logger } from '@/lib/logger';
import { AutoPartsApiError } from '../providers/autopartsapi/types';
import {
  manufacturersPath, modelsPath, vehicleVariantsPath,
  AUTOPARTS_TYPE_ID, AUTOPARTS_ENGLISH_LANG_ID, AUTOPARTS_DEFAULT_COUNTRY_FILTER_ID,
} from '../providers/autopartsapi/endpoints';
import { cachedFetch, TTL } from './referenceCache';
import { vehicleFingerprint, hasEnoughToResolve } from './fingerprint';
import { matchManufacturer, type ProviderManufacturer } from './manufacturer';
import { matchModel, type ProviderModel } from './model';
import { matchModification } from './modification';
import type {
  CanonicalVehicle, ModificationCandidate, ProviderVehicleResolution,
  VehicleResolutionEvidence,
} from './types';

/**
 * Why a resolution ended where it did — a code, not a sentence.
 *
 * Kept separate from the display text so callers can branch, telemetry can
 * aggregate, and the wording can change without breaking either.
 */
export type ResolutionReasonCode =
  | 'cached_mapping_reused'
  | 'missing_make_or_model'
  | 'manufacturer_not_found'
  | 'manufacturer_ambiguous'
  | 'model_not_found'
  | 'model_ambiguous'
  | 'year_outside_range'
  | 'missing_engine_identity'
  | 'multiple_engine_variants'
  | 'variant_not_found'
  | 'resolved_unique'
  | 'provider_unavailable';

export interface ResolutionOutcome {
  resolution: ProviderVehicleResolution;
  reasonCode: ResolutionReasonCode;
  /** Present whenever a technician could resolve this by choosing. */
  candidates?: ModificationCandidate[];
  /** External calls this invocation actually spent. */
  externalCalls: number;
}

/** Extra state for a provider-unavailable outcome, which is not a resolution. */
export type ResolverStatus = ProviderVehicleResolution['resolutionStatus'] | 'provider_unavailable';

// ─── Provider payload readers ────────────────────────────────────────────────
//
// Tolerant on shape, because the live envelopes are not yet observed for these
// three endpoints. Every reader drops a row it cannot identify rather than
// inventing an id — a wrong manufacturer id resolves to a plausible catalogue
// for the wrong marque.

function rowsOf(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  for (const k of ['data', 'items', 'result', 'results', 'manufacturers', 'models', 'types', 'vehicles']) {
    const v = (payload as Record<string, unknown>)?.[k];
    if (Array.isArray(v)) return v as Array<Record<string, unknown>>;
  }
  return [];
}

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function str(v: unknown): string | undefined {
  const s = String(v ?? '').trim();
  return s ? s : undefined;
}

export function readManufacturers(payload: unknown): ProviderManufacturer[] {
  return rowsOf(payload)
    .map(r => ({
      id: num(r.manuId ?? r.manufacturerId ?? r.id) ?? 0,
      name: str(r.manuName ?? r.manufacturerName ?? r.name) ?? '',
    }))
    .filter(m => m.id > 0 && m.name);
}

export function readModels(payload: unknown): ProviderModel[] {
  return rowsOf(payload)
    .map(r => ({
      id: num(r.modelId ?? r.modId ?? r.id) ?? 0,
      name: str(r.modelName ?? r.modName ?? r.name) ?? '',
      yearFrom: yearOf(r.yearOfConstrFrom ?? r.constructionFrom ?? r.yearFrom ?? r.from),
      yearTo: yearOf(r.yearOfConstrTo ?? r.constructionTo ?? r.yearTo ?? r.to),
    }))
    .filter(m => m.id > 0 && m.name);
}

function yearOf(v: unknown): number | undefined {
  // Providers write "201401", "2014-01", 2014 or "01.2014". Take the first
  // plausible four-digit year rather than assuming a format.
  const s = String(v ?? '');
  const m = s.match(/(19|20)\d{2}/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isInteger(n) && n > 1900 && n < 2200 ? n : undefined;
}

export function readVariants(payload: unknown): ModificationCandidate[] {
  return rowsOf(payload)
    .map(r => ({
      vehicleId: num(r.vehicleId ?? r.carId ?? r.typeId ?? r.id) ?? 0,
      description: str(r.typeName ?? r.description ?? r.name) ?? '',
      yearFrom: yearOf(r.yearOfConstrFrom ?? r.constructionFrom ?? r.yearFrom),
      yearTo: yearOf(r.yearOfConstrTo ?? r.constructionTo ?? r.yearTo),
      engineCode: str(r.engineCode ?? r.motorCode ?? r.engine),
      displacementL: ccToLitres(r.cylinderCapacityCcm ?? r.ccm ?? r.capacity),
      fuel: str(r.fuelType ?? r.fuel),
      powerKw: num(r.powerKw ?? r.kw ?? r.powerKW),
      bodyType: str(r.bodyType ?? r.body),
      driveType: str(r.driveType ?? r.drive),
      transmission: str(r.transmissionType ?? r.transmission),
    }))
    .filter(v => v.vehicleId > 0 && v.description);
}

function ccToLitres(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  // Providers give cubic centimetres. 1796 -> 1.8.
  return n > 100 ? Math.round(n / 100) / 10 : n;
}

// ─── The resolver ────────────────────────────────────────────────────────────

export interface ResolveOptions {
  shopId?: string;
  /** Skip the persisted mapping. Used by an explicit re-resolve. */
  bypassMapping?: boolean;
  /** Already-loaded mapping, so the caller owns the database round trip. */
  existingMapping?: {
    vehicle_fingerprint: string;
    provider_vehicle_id: number | null;
    provider_manufacturer_id: number | null;
    provider_model_id: number | null;
    provider_manufacturer_name: string | null;
    provider_model_name: string | null;
    provider_modification_desc: string | null;
    resolution_status: string;
  } | null;
  now?: Date;
}

function base(vehicle: CanonicalVehicle, fingerprint: string, now: Date): ProviderVehicleResolution {
  return {
    provider: 'autopartsapi',
    redlinedVehicleId: vehicle.id,
    typeId: AUTOPARTS_TYPE_ID.passengerCar,
    resolutionStatus: 'insufficient_data',
    evidence: [],
    fingerprint,
    resolvedAt: now.toISOString(),
  };
}

export async function resolveProviderVehicle(
  vehicle: CanonicalVehicle,
  options: ResolveOptions = {},
): Promise<ResolutionOutcome> {
  const now = options.now ?? new Date();
  const fingerprint = vehicleFingerprint(vehicle);
  const resolution = base(vehicle, fingerprint, now);
  const evidence: VehicleResolutionEvidence[] = [];
  let externalCalls = 0;

  // ── 0. The persisted mapping, before anything is spent ───────────────────
  const cached = options.existingMapping;
  if (!options.bypassMapping && cached
    && cached.vehicle_fingerprint === fingerprint
    && cached.resolution_status === 'resolved'
    && cached.provider_vehicle_id) {
    evidence.push({
      step: 'cache', outcome: 'reused',
      detail: 'Reused the stored catalogue mapping for this vehicle.',
    });
    return {
      resolution: {
        ...resolution,
        resolutionStatus: 'resolved',
        manufacturerId: cached.provider_manufacturer_id ?? undefined,
        modelId: cached.provider_model_id ?? undefined,
        vehicleId: cached.provider_vehicle_id,
        manufacturerName: cached.provider_manufacturer_name ?? undefined,
        modelName: cached.provider_model_name ?? undefined,
        modificationDescription: cached.provider_modification_desc ?? undefined,
        evidence,
      },
      reasonCode: 'cached_mapping_reused',
      externalCalls: 0,
    };
  }

  if (!hasEnoughToResolve(vehicle)) {
    evidence.push({
      step: 'manufacturer', outcome: 'missing_input',
      detail: 'This vehicle has no make and model recorded.',
    });
    return {
      resolution: { ...resolution, resolutionStatus: 'insufficient_data', evidence },
      reasonCode: 'missing_make_or_model',
      externalCalls: 0,
    };
  }

  const ctx = { shopId: options.shopId };

  try {
    // ── 1. Manufacturer ────────────────────────────────────────────────────
    const manuPayload = await cachedFetch<unknown>(
      manufacturersPath(), 'manufacturers', TTL.manufacturers, ctx);
    externalCalls += 1;

    const manuMatch = matchManufacturer(vehicle.make, readManufacturers(manuPayload));
    evidence.push({
      step: 'manufacturer',
      outcome: manuMatch.status === 'matched' ? 'matched'
        : manuMatch.status === 'ambiguous' ? 'ambiguous'
          : manuMatch.status === 'missing_input' ? 'missing_input' : 'no_match',
      detail: manuMatch.detail,
      candidates: manuMatch.candidates?.length,
    });

    if (manuMatch.status !== 'matched') {
      return {
        resolution: {
          ...resolution,
          resolutionStatus: manuMatch.status === 'ambiguous' ? 'ambiguous' : 'not_found',
          evidence,
        },
        reasonCode: manuMatch.status === 'ambiguous' ? 'manufacturer_ambiguous' : 'manufacturer_not_found',
        externalCalls,
      };
    }

    const manufacturer = manuMatch.manufacturer!;
    resolution.manufacturerId = manufacturer.id;
    resolution.manufacturerName = manufacturer.name;

    // ── 2. Model series ────────────────────────────────────────────────────
    const modelPayload = await cachedFetch<unknown>(
      modelsPath({ manufacturerId: manufacturer.id }), 'models', TTL.models, ctx);
    externalCalls += 1;

    const modelMatch = matchModel(vehicle.model, vehicle.year, readModels(modelPayload));
    evidence.push({
      step: 'model',
      outcome: modelMatch.status === 'matched' ? 'matched'
        : modelMatch.status === 'ambiguous' ? 'ambiguous'
          : modelMatch.status === 'missing_input' ? 'missing_input' : 'no_match',
      detail: modelMatch.detail,
      candidates: modelMatch.candidates?.length,
    });

    if (modelMatch.status !== 'matched') {
      return {
        resolution: {
          ...resolution,
          resolutionStatus: modelMatch.status === 'ambiguous' ? 'ambiguous' : 'not_found',
          evidence,
        },
        reasonCode: modelMatch.status === 'ambiguous' ? 'model_ambiguous'
          : modelMatch.detail.includes('not in production') ? 'year_outside_range'
            : 'model_not_found',
        externalCalls,
      };
    }

    const model = modelMatch.model!;
    resolution.modelId = model.id;
    resolution.modelName = model.name;

    // ── 3. Variant, with engine specs ──────────────────────────────────────
    const variantPayload = await cachedFetch<unknown>(
      vehicleVariantsPath({ modelId: model.id }), 'vehicle_variants', TTL.vehicleVariants, ctx);
    externalCalls += 1;

    const candidates = readVariants(variantPayload);
    const modMatch = matchModification({
      year: vehicle.year,
      engine: vehicle.engine,
      fuelType: vehicle.fuelType,
      transmission: vehicle.transmission,
    }, candidates);

    evidence.push({
      step: 'modification',
      outcome: modMatch.status === 'matched' ? 'matched'
        : modMatch.status === 'no_match' ? 'no_match' : 'ambiguous',
      detail: modMatch.detail,
      candidates: modMatch.candidates?.length,
    });

    if (modMatch.status === 'matched') {
      const m = modMatch.modification!;
      return {
        resolution: {
          ...resolution,
          resolutionStatus: 'resolved',
          vehicleId: m.vehicleId,
          modificationDescription: m.description,
          evidence,
        },
        reasonCode: 'resolved_unique',
        externalCalls,
      };
    }

    return {
      resolution: {
        ...resolution,
        resolutionStatus: modMatch.status === 'no_match' ? 'not_found'
          : modMatch.status === 'insufficient_data' ? 'insufficient_data' : 'ambiguous',
        evidence,
      },
      reasonCode: modMatch.status === 'no_match' ? 'variant_not_found'
        : modMatch.status === 'insufficient_data' ? 'missing_engine_identity'
          : 'multiple_engine_variants',
      candidates: modMatch.candidates,
      externalCalls,
    };
  } catch (err) {
    // A provider outage is not a resolution failure and must never be
    // recorded as one — the vehicle is fine, we simply could not ask.
    const kind = err instanceof AutoPartsApiError ? err.kind : 'unknown';
    logger.warn('parts.vehicleResolution.provider_unavailable', { kind });
    evidence.push({
      step: 'manufacturer', outcome: 'no_match',
      detail: 'The parts catalogue could not be reached.',
    });
    return {
      resolution: { ...resolution, resolutionStatus: 'insufficient_data', evidence },
      reasonCode: 'provider_unavailable',
      externalCalls,
    };
  }
}

/** Constants restated where a reader will look for them. */
export const RESOLVER_CONTEXT = {
  typeId: AUTOPARTS_TYPE_ID.passengerCar,
  langId: AUTOPARTS_ENGLISH_LANG_ID,
  countryFilterId: AUTOPARTS_DEFAULT_COUNTRY_FILTER_ID,
} as const;
