import 'server-only';

/**
 * Applying catalogue evidence to a canonical vehicle — only ever the fields a
 * technician explicitly chose, and only ever values the SERVER derived.
 *
 * ## The browser chooses fields, not values
 *
 * A request says "apply engineCode". It does not say what engineCode is. The
 * server re-derives the comparison for the current fingerprint and takes the
 * value from there. Otherwise a forged body could write any string into a
 * vehicle and have it look like catalogue evidence — and a vehicle's engine
 * is an input to fitment, so forging one forges a parts recommendation.
 *
 * ## Fingerprint consequences
 *
 * Three of the enrichable fields are NOT part of the fingerprint by design —
 * engineCode, displacementL and cylinders describe a vehicle without changing
 * which vehicle it is. Enriching them therefore cannot invalidate the mapping
 * that supplied them, which is the loop this milestone was told not to build.
 *
 * `fuelType` IS a fingerprint field, so accepting it changes the fingerprint.
 * That is handled explicitly rather than hidden: the mapping is rebound only
 * when the variant that is already mapped is itself the source of the new
 * value, and invalidated otherwise.
 */
import { getAdminDb } from '@/lib/supabaseServer';
import { vehicleFingerprint } from '@/lib/parts/vehicleResolution/fingerprint';
import type { QualityVehicle } from './quality';
import type { CatalogComparison, FieldSuggestion } from './catalogComparison';

/**
 * The only vehicle fields catalogue evidence may ever write.
 *
 * Audited against the real schema rather than assumed. `vehicles` has 31
 * columns; these four are the ones a provider variant can actually speak to
 * AND that describe the vehicle rather than the customer's relationship to
 * it.
 *
 * Deliberately absent, and each for its own reason:
 *   vin          — identity a shop verified off the car; a catalogue lookup
 *                  cannot know it and must never replace it
 *   make, model  — a catalogue disagreeing here is a REVIEW, not a rewrite
 *   plate,       — not fitment data, and not the provider's business
 *   mileage,
 *   status, notes
 *   shop_id,     — ownership and money. Never.
 *   customer_id,
 *   owner_id
 *   engine       — free text a human wrote ("5.5L 8-cyl"). engineCode is the
 *                  structured equivalent and is written instead.
 *   transmission — the provider does not supply it at all.
 */
export const CATALOG_ENRICHABLE_FIELDS = [
  'engineCode', 'displacementL', 'cylinders', 'fuelType',
] as const;

export type EnrichableField = typeof CATALOG_ENRICHABLE_FIELDS[number];

/** Camel field to its real column. Explicit, so no field name is derived. */
const COLUMN: Record<EnrichableField, string> = {
  engineCode: 'engine_code',
  displacementL: 'displacement_l',
  cylinders: 'cylinders',
  fuelType: 'fuel_type',
};

/** Fields that participate in the vehicle fingerprint. */
const FINGERPRINT_RELEVANT: ReadonlySet<string> = new Set(['fuelType']);

export function isEnrichableField(f: unknown): f is EnrichableField {
  return typeof f === 'string'
    && (CATALOG_ENRICHABLE_FIELDS as readonly string[]).includes(f);
}

export interface EnrichmentPlanEntry {
  field: EnrichableField;
  column: string;
  before: string | null;
  after: string;
  /** MISSING_LOCAL or CONFLICT — a MATCH needs no action and is refused. */
  comparison: FieldSuggestion['comparison'];
}

export type EnrichmentRefusal =
  | 'not_enrichable'
  | 'not_offered'
  | 'nothing_to_change'
  | 'no_catalog_value';

export interface EnrichmentPlan {
  entries: EnrichmentPlanEntry[];
  refused: Array<{ field: string; reason: EnrichmentRefusal }>;
}

/**
 * Turn requested field names into a plan of concrete writes.
 *
 * Pure and exported so the decision can be tested without a database. Every
 * value comes from `comparison`, which the server built; nothing in the
 * request contributes a value.
 */
export function planEnrichment(
  requestedFields: readonly string[],
  comparison: CatalogComparison,
): EnrichmentPlan {
  const entries: EnrichmentPlanEntry[] = [];
  const refused: Array<{ field: string; reason: EnrichmentRefusal }> = [];
  const seen = new Set<string>();

  for (const field of requestedFields) {
    if (seen.has(field)) continue;
    seen.add(field);

    if (!isEnrichableField(field)) {
      // Covers make, model, vin, shop_id and anything else a caller invents.
      refused.push({ field, reason: 'not_enrichable' });
      continue;
    }

    const s = comparison.suggestions.find(x => x.field === field);
    if (!s) { refused.push({ field, reason: 'not_offered' }); continue; }
    if (s.suggestedValue === null) { refused.push({ field, reason: 'no_catalog_value' }); continue; }
    if (s.comparison === 'MATCH' || s.comparison === 'UNKNOWN') {
      // Applying a value already held is a no-op that would still write an
      // audit row and disturb a fingerprint. Refused rather than performed.
      refused.push({ field, reason: 'nothing_to_change' });
      continue;
    }

    entries.push({
      field,
      column: COLUMN[field],
      before: s.currentValue,
      after: s.suggestedValue,
      comparison: s.comparison,
    });
  }

  return { entries, refused };
}

/** What should happen to the provider mapping after a plan is applied. */
export type MappingOutcome = 'unchanged' | 'rebound' | 'invalidated';

export interface FingerprintDecision {
  before: string;
  after: string;
  changed: boolean;
  mapping: MappingOutcome;
  reason: string;
}

/**
 * Decide the fingerprint and mapping consequence of a plan — before writing.
 *
 * ## The safe rebind
 *
 * When the only fingerprint-relevant change is a value the MAPPED VARIANT
 * ITSELF supplied, the vehicle has not become a different car: it has become
 * a more completely described version of the same one, using the catalogue's
 * own words. Re-resolving would spend calls to reach the variant we are
 * already on. So the mapping is rebound to the new fingerprint, with no
 * external call.
 *
 * That holds only because `planEnrichment` takes every value from the
 * server-built comparison, which is derived from exactly that variant. If a
 * value could come from anywhere else this reasoning would be unsound.
 *
 * ## When it is not safe
 *
 * A CONFLICT replacement is a different matter: the record said one thing and
 * the catalogue another, and resolving that disagreement can genuinely change
 * which variant applies. The mapping is invalidated and the technician
 * re-resolves, which is a cost but an honest one.
 */
export function decideFingerprint(
  vehicle: QualityVehicle,
  plan: EnrichmentPlan,
  hasMapping: boolean,
): FingerprintDecision {
  const before = vehicleFingerprint(vehicle);

  const updated: QualityVehicle = { ...vehicle };
  for (const e of plan.entries) {
    (updated as unknown as Record<string, unknown>)[e.field] =
      e.field === 'displacementL' || e.field === 'cylinders' ? Number(e.after) : e.after;
  }
  const after = vehicleFingerprint(updated);
  const changed = before !== after;

  if (!hasMapping) {
    return { before, after, changed, mapping: 'unchanged', reason: 'No provider mapping to affect.' };
  }
  if (!changed) {
    return {
      before, after, changed, mapping: 'unchanged',
      reason: 'No fingerprint field changed, so the mapping still describes this vehicle.',
    };
  }

  const fingerprintEntries = plan.entries.filter(e => FINGERPRINT_RELEVANT.has(e.field));
  const anyConflictReplacement = fingerprintEntries.some(e => e.comparison === 'CONFLICT');

  if (anyConflictReplacement) {
    return {
      before, after, changed, mapping: 'invalidated',
      reason: 'A conflicting identity value was replaced, which can change which '
        + 'catalogue variant applies. The vehicle must be resolved again.',
    };
  }

  return {
    before, after, changed, mapping: 'rebound',
    reason: 'The changed fields were supplied by the mapped variant itself, so the '
      + 'mapping still describes this vehicle and is rebound without a provider call.',
  };
}

export interface ApplyResult {
  applied: EnrichmentPlanEntry[];
  refused: EnrichmentPlan['refused'];
  fingerprint: FingerprintDecision;
}

/**
 * Write the plan, move the mapping, and record one audit row.
 *
 * Ordering is deliberate: the vehicle is updated first, then the mapping is
 * reconciled to the identity that now exists. A mapping rebound before the
 * write would briefly point at a fingerprint no vehicle had.
 */
export async function applyEnrichment(args: {
  shopId: string;
  vehicle: QualityVehicle;
  plan: EnrichmentPlan;
  decision: FingerprintDecision;
  comparison: CatalogComparison;
  actorUserId: string;
}): Promise<ApplyResult> {
  const { shopId, vehicle, plan, decision, comparison, actorUserId } = args;
  const db = getAdminDb();

  if (plan.entries.length) {
    const patch: Record<string, unknown> = {};
    for (const e of plan.entries) {
      patch[e.column] = e.field === 'displacementL' || e.field === 'cylinders'
        ? Number(e.after) : e.after;
    }

    const { error } = await db.from('vehicles')
      .update(patch)
      .eq('id', vehicle.id)
      // Scoped to the shop in the WHERE clause as well as checked earlier.
      // service_role bypasses RLS entirely, so this predicate is the boundary.
      .eq('shop_id', shopId);
    if (error) throw new Error('vehicle update failed');

    if (decision.mapping === 'rebound') {
      await db.from('parts_provider_vehicle_mappings')
        .update({ vehicle_fingerprint: decision.after, updated_at: new Date().toISOString() })
        .eq('shop_id', shopId).eq('vehicle_id', vehicle.id);
    } else if (decision.mapping === 'invalidated') {
      await db.from('parts_provider_vehicle_mappings')
        .delete().eq('shop_id', shopId).eq('vehicle_id', vehicle.id);
    }

    /**
     * One audit row for the whole enrichment, carrying the provenance the
     * milestone requires: which provider, which variant, which fingerprint,
     * every before and after.
     *
     * Never the raw provider response and never a credential — `writeAudit`
     * redacts, and nothing here passes a payload in the first place.
     */
    await db.rpc('record_audit_event', {
      p_shop_id: shopId,
      p_actor_type: 'user',
      p_actor_role: 'technician',
      p_action: 'vehicle.updated',
      p_entity_type: 'vehicle',
      p_entity_id: vehicle.id,
      p_before: Object.fromEntries(plan.entries.map(e => [e.column, e.before])),
      p_after: Object.fromEntries(plan.entries.map(e => [e.column, e.after])),
      p_metadata: {
        reason: 'catalog_enrichment',
        source: 'autopartsapi',
        providerVehicleId: comparison.providerVehicleId ?? null,
        providerModification: comparison.modificationDescription ?? null,
        fingerprintBefore: decision.before,
        fingerprintAfter: decision.after,
        mappingOutcome: decision.mapping,
        confirmedByUserId: actorUserId,
      },
      p_request_id: null,
    });
  }

  return { applied: plan.entries, refused: plan.refused, fingerprint: decision };
}
