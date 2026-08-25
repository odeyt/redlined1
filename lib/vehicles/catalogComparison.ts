import 'server-only';

/**
 * Comparing a Redlined1 vehicle with the catalogue variant it is mapped to.
 *
 * ## It never calls the provider
 *
 * Everything here comes from state Parts Intelligence already holds: the
 * stored `parts_provider_vehicle_mappings` row, and the variants payload
 * sitting in the persistent reference cache from M-PARTS2C.3. Opening a
 * vehicle page, an estimate or a quality panel must not spend quota, and a
 * cosmetic badge is the worst possible reason to burn a call.
 *
 * If nothing is cached, the answer is "no catalogue information available"
 * — never a silent fetch.
 *
 * ## The catalogue is not authoritative
 *
 * A provider variant is evidence about a vehicle, not a correction to it. The
 * customer's own record may be right where the catalogue is wrong or coarse.
 * So this produces SUGGESTIONS with provenance attached, and never a value.
 * Nothing here writes anything.
 *
 * ## Absent is not conflicting
 *
 * A field the provider does not supply is UNKNOWN. Reporting it as a match
 * would invent agreement; reporting it as a conflict would invent a problem.
 */
import { getAdminDb } from '@/lib/supabaseServer';
import { vehicleVariantsPath } from '@/lib/parts/providers/autopartsapi/endpoints';
import { neverEquivalentMarques, sameMarque, type QualityVehicle } from './quality';

/** What a comparison can conclude about one field. */
export type FieldComparison = 'MATCH' | 'CONFLICT' | 'MISSING_LOCAL' | 'UNKNOWN';

/**
 * One field, compared — carrying where the catalogue value came from.
 *
 * Provenance travels with the suggestion rather than being reduced away,
 * because the server has to re-derive exactly this to accept a write, and
 * because an audit row that cannot say which variant supplied a value is not
 * much of an audit row.
 */
export interface FieldSuggestion {
  field: string;
  label: string;
  comparison: FieldComparison;
  currentValue: string | null;
  suggestedValue: string | null;
  /** Provenance. */
  source: 'autopartsapi';
  providerVehicleId: number;
  mappingFingerprint: string;
  observedAt: string;
}

export interface CatalogComparison {
  available: boolean;
  /** Why there is nothing to compare, when there is nothing. */
  unavailableReason?:
    | 'no_mapping' | 'mapping_not_resolved' | 'fingerprint_stale'
    | 'no_cached_variants' | 'variant_not_in_cache';
  providerVehicleId?: number;
  manufacturerName?: string;
  modelName?: string;
  modificationDescription?: string;
  /** True when a technician chose this variant rather than the resolver. */
  technicianConfirmed?: boolean;
  suggestions: FieldSuggestion[];
}

/** The subset of a cached variant row this milestone reads. */
interface CachedVariant {
  vehicleId?: number;
  modelName?: string;
  manufacturerName?: string;
  typeEngineName?: string;
  engineCodes?: string;
  capacityLt?: string | number;
  numberOfCylinders?: number;
  fuelType?: string;
  constructionIntervalStart?: string;
  constructionIntervalEnd?: string;
}

function text(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s.length ? s : null;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Case and punctuation only — "M 272.974" and "M272.974" are one code. */
function sameCode(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return norm(a) === norm(b);
}

function rowsOf(payload: unknown): CachedVariant[] {
  if (Array.isArray(payload)) return payload as CachedVariant[];
  for (const k of ['modelTypes', 'data', 'items', 'types', 'vehicles', 'result', 'results']) {
    const v = (payload as Record<string, unknown>)?.[k];
    if (Array.isArray(v)) return v as CachedVariant[];
  }
  return [];
}

/**
 * Compare one field and say honestly what came of it.
 *
 * The ordering matters: an absent catalogue value is UNKNOWN before anything
 * else is considered, because with nothing to compare against there is no
 * match and no conflict to report.
 */
function compare(args: {
  field: string; label: string;
  current: string | null; catalog: string | null;
  equal?: (a: string, b: string) => boolean;
  provenance: Omit<FieldSuggestion, 'field' | 'label' | 'comparison' | 'currentValue' | 'suggestedValue'>;
}): FieldSuggestion {
  const { field, label, current, catalog, provenance } = args;
  const eq = args.equal ?? ((a, b) => a.trim().toLowerCase() === b.trim().toLowerCase());

  let comparison: FieldComparison;
  if (catalog === null) comparison = 'UNKNOWN';
  else if (current === null) comparison = 'MISSING_LOCAL';
  else comparison = eq(current, catalog) ? 'MATCH' : 'CONFLICT';

  return { field, label, comparison, currentValue: current, suggestedValue: catalog, ...provenance };
}

/**
 * Everything the catalogue can say about this vehicle, from cache alone.
 *
 * Returns `available: false` with a reason rather than throwing, because a
 * missing mapping is the normal state for most vehicles and is not an error.
 */
export async function compareVehicleWithCatalog(
  shopId: string,
  vehicle: QualityVehicle,
  currentFingerprint: string,
): Promise<CatalogComparison> {
  const db = getAdminDb();

  const { data: mapping } = await db
    .from('parts_provider_vehicle_mappings')
    .select('provider_vehicle_id, provider_model_id, provider_manufacturer_name, '
      + 'provider_model_name, provider_modification_desc, resolution_status, '
      + 'vehicle_fingerprint, confirmed_by_user_id, updated_at')
    .eq('shop_id', shopId)
    .eq('vehicle_id', vehicle.id)
    .maybeSingle();

  if (!mapping) return { available: false, unavailableReason: 'no_mapping', suggestions: [] };

  const m = mapping as unknown as Record<string, unknown>;
  if (m.resolution_status !== 'resolved' || !num(m.provider_vehicle_id)) {
    return { available: false, unavailableReason: 'mapping_not_resolved', suggestions: [] };
  }

  /**
   * A mapping resolved from a different identity says nothing about this one.
   * The same rule the search path enforces, applied here so a quality panel
   * cannot quietly present evidence about a vehicle as it used to be.
   */
  if (m.vehicle_fingerprint !== currentFingerprint) {
    return { available: false, unavailableReason: 'fingerprint_stale', suggestions: [] };
  }

  const modelId = num(m.provider_model_id);
  if (!modelId) return { available: false, unavailableReason: 'no_cached_variants', suggestions: [] };

  // The cache, never the provider.
  const { data: cached } = await db
    .from('parts_provider_reference_cache')
    .select('payload, expires_at')
    .eq('cache_key', vehicleVariantsPath({ modelId }))
    .maybeSingle();

  if (!cached) return { available: false, unavailableReason: 'no_cached_variants', suggestions: [] };

  // An expired row is not current information. Read-only here — the sweep
  // belongs to the cache, and a quality panel must not mutate it.
  const expiresAt = Date.parse(String((cached as { expires_at: string }).expires_at));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { available: false, unavailableReason: 'no_cached_variants', suggestions: [] };
  }

  const providerVehicleId = num(m.provider_vehicle_id)!;
  const variant = rowsOf((cached as { payload: unknown }).payload)
    .find(r => Number(r.vehicleId) === providerVehicleId);

  if (!variant) {
    return { available: false, unavailableReason: 'variant_not_in_cache', suggestions: [] };
  }

  const provenance = {
    source: 'autopartsapi' as const,
    providerVehicleId,
    mappingFingerprint: currentFingerprint,
    observedAt: String(m.updated_at ?? new Date().toISOString()),
  };

  const suggestions: FieldSuggestion[] = [
    compare({
      field: 'engineCode', label: 'Engine code',
      current: text(vehicle.engineCode), catalog: text(variant.engineCodes),
      equal: (a, b) => sameCode(a, b), provenance,
    }),
    compare({
      field: 'displacementL', label: 'Displacement',
      current: vehicle.displacementL != null ? String(vehicle.displacementL) : null,
      catalog: num(variant.capacityLt) ? String(Number(num(variant.capacityLt)!.toFixed(2))) : null,
      equal: (a, b) => Math.abs(Number(a) - Number(b)) < 0.06,
      provenance,
    }),
    compare({
      field: 'cylinders', label: 'Cylinders',
      current: vehicle.cylinders != null ? String(vehicle.cylinders) : null,
      catalog: num(variant.numberOfCylinders) ? String(variant.numberOfCylinders) : null,
      provenance,
    }),
    compare({
      field: 'fuelType', label: 'Fuel type',
      current: text(vehicle.fuelType), catalog: text(variant.fuelType), provenance,
    }),
    /**
     * Make and model are reported but are NOT enrichable. A catalogue
     * disagreeing about the marque is a reason for a human to look, not a
     * value to copy over the customer's own record.
     */
    compare({
      field: 'make', label: 'Make',
      current: text(vehicle.make), catalog: text(variant.manufacturerName),
      equal: (a, b) => sameMarque(a, b) && !neverEquivalentMarques(a, b),
      provenance,
    }),
    compare({
      field: 'model', label: 'Model',
      current: text(vehicle.model), catalog: text(variant.modelName),
      // The catalogue writes "S-CLASS (W221, V221)" where a shop writes
      // "S-Class". Containment, never a similarity score.
      equal: (a, b) => {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        return norm(b).includes(norm(a)) || norm(a).includes(norm(b));
      },
      provenance,
    }),
  ];

  return {
    available: true,
    providerVehicleId,
    manufacturerName: text(m.provider_manufacturer_name) ?? undefined,
    modelName: text(m.provider_model_name) ?? undefined,
    modificationDescription: text(m.provider_modification_desc) ?? undefined,
    technicianConfirmed: Boolean(m.confirmed_by_user_id),
    suggestions,
  };
}
