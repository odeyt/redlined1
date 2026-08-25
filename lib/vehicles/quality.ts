/**
 * The one place that decides whether a vehicle record is good enough to
 * identify parts with.
 *
 * ## Why it is one function
 *
 * Vehicle-quality logic scattered across UI components becomes several
 * slightly different opinions about the same car, and the technician sees a
 * warning on one screen and not another. Everything here is pure: no
 * database, no provider, no React. It can be tested by calling it.
 *
 * ## Incomplete is not invalid
 *
 * A 2019 Toyota Tacoma with no engine recorded is a perfectly good vehicle
 * record. It can be booked, invoiced and driven. What it cannot do is pin one
 * catalogue variant without help. Those are different statements and this
 * file never conflates them: the status is INCOMPLETE, never INVALID, and
 * nothing here should ever be used to block ordinary customer work.
 *
 * ## Completeness and confidence are separate axes
 *
 * A record can be complete and unconfirmed, or sparse and technician
 * confirmed. Folding them into one ladder would let CATALOG_MATCHED imply
 * "this record is correct", which it does not: it means the catalogue agreed
 * with the fields we had, not that the fields we lack are unimportant.
 */
import type { CanonicalVehicle } from '@/lib/parts/vehicleResolution/types';

export type VehicleQualityStatus = 'COMPLETE' | 'INCOMPLETE' | 'CONFLICT';

export type VehicleIdentityConfidence =
  | 'UNCONFIRMED'
  | 'CATALOG_MATCHED'
  | 'TECHNICIAN_CONFIRMED';

/**
 * What a field is FOR, which decides what its absence costs.
 *
 * Only fields that exist on `vehicles` appear here. The schema was audited
 * rather than assumed: there is no drivetrain column, and engine_code,
 * displacement_l and cylinders arrive with this milestone.
 */
export type FieldSignificance = 'CORE_IDENTITY' | 'FITMENT_ENRICHMENT' | 'NON_FITMENT';

/** Without all three there is nothing to look up, and no call is worth spending. */
export const CORE_IDENTITY_FIELDS = ['year', 'make', 'model'] as const;

/**
 * Narrows a catalogue match once the core is known. Absence here degrades
 * precision; it never blocks.
 */
export const FITMENT_ENRICHMENT_FIELDS = [
  'engine', 'engineCode', 'displacementL', 'cylinders',
  'fuelType', 'transmission', 'trim',
] as const;

/**
 * Present on the record and deliberately NOT a parts-identity requirement.
 * Listed so the intent is explicit rather than implied by omission.
 */
export const NON_FITMENT_FIELDS = ['plate', 'mileage', 'status', 'label'] as const;

export type FitmentField = typeof FITMENT_ENRICHMENT_FIELDS[number];
export type CoreField = typeof CORE_IDENTITY_FIELDS[number];

/**
 * The vehicle as this analyzer sees it.
 *
 * A superset of CanonicalVehicle: the fingerprint's eight fields plus the
 * three this milestone adds, which are detail rather than identity and are
 * deliberately absent from the fingerprint.
 */
export interface QualityVehicle extends CanonicalVehicle {
  engineCode?: string;
  displacementL?: number;
  cylinders?: number;
  /** Human-facing label. NEVER canonical identity — see `labelConflict`. */
  label?: string;
}

export interface VehicleFieldGap {
  field: FitmentField | CoreField;
  significance: FieldSignificance;
  /** Shown to a technician. Names the field, never scolds. */
  label: string;
}

export interface VehicleConflict {
  kind: 'display_vs_structured' | 'internal';
  field: string;
  /** What the record holds. */
  currentValue: string;
  /** What disagrees with it, and where that came from. */
  otherValue: string;
  otherSource: 'display_label' | 'structured';
  detail: string;
}

export interface VehicleQuality {
  status: VehicleQualityStatus;
  /**
   * Fraction of FITMENT fields present, 0–1. Core fields are not scored:
   * they are a precondition, and a vehicle missing one is INCOMPLETE
   * regardless of how much enrichment it happens to carry.
   */
  completeness: number;
  missingFields: VehicleFieldGap[];
  conflicts: VehicleConflict[];
  /** True when the core is present, so resolution is worth attempting. */
  resolvable: boolean;
}

const FIELD_LABEL: Record<string, string> = {
  year: 'Year', make: 'Make', model: 'Model',
  engine: 'Engine', engineCode: 'Engine code', displacementL: 'Displacement',
  cylinders: 'Cylinders', fuelType: 'Fuel type', transmission: 'Transmission',
  trim: 'Trim',
};

function present(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0;
  return String(v).trim().length > 0;
}

/**
 * Manufacturers that share platforms and parts but are NEVER the same marque.
 *
 * Reused in spirit from the resolver's own rule. A Lexus is not a Toyota to a
 * parts catalogue however much they share, and treating them as equivalent is
 * how a technician orders the wrong part with full confidence.
 */
const NEVER_EQUIVALENT: ReadonlyArray<readonly [string, string]> = [
  ['toyota', 'lexus'], ['honda', 'acura'], ['nissan', 'infiniti'],
  ['volkswagen', 'audi'], ['hyundai', 'kia'], ['ford', 'lincoln'],
];

/** Case and punctuation only. Never a similarity score. */
export function sameMarque(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const x = norm(a), y = norm(b);
  if (x === y) return true;
  // Explicitly not equal, even though the strings differ only by brand.
  return false;
}

/** True when two marques are related but must never be treated as one. */
export function neverEquivalentMarques(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const x = norm(a), y = norm(b);
  return NEVER_EQUIVALENT.some(([p, q]) => (x === p && y === q) || (x === q && y === p));
}

/**
 * Tokens from a human label that could name a model.
 *
 * Deliberately crude. This exists to raise a REVIEW flag, never to correct
 * anything, so a false negative costs nothing and a false positive costs a
 * technician thirty seconds.
 */
function labelTokens(label: string): string[] {
  return label.toLowerCase()
    .replace(/#\s*\d+/g, ' ')          // "#1112" is a shop reference, not a model
    .replace(/\b(19|20)\d{2}\b/g, ' ') // years are compared separately
    .replace(/[^a-z0-9]+/g, ' ')
    .trim().split(' ').filter(t => t.length > 1);
}

/**
 * Does a display label appear to name a DIFFERENT model than the record?
 *
 * The real case that prompted this: an estimate headed "Mercedes Benz C 200
 * #1112 2014" resolving to a `vehicles` row whose model is "S-Class". Both
 * cannot be true.
 *
 * Only ever a warning. The label is free text — across this shop's records it
 * holds customer names, plate fragments and notes — so it is never parsed
 * back over structured fields. See docs/VEHICLE-DATA-QUALITY.md.
 */
export function labelConflict(v: QualityVehicle): VehicleConflict | null {
  if (!v.label || !v.model) return null;

  const tokens = labelTokens(v.label);
  if (!tokens.length) return null;

  const modelTokens = labelTokens(v.model);
  if (!modelTokens.length) return null;

  /**
   * Everything below exists because the first version of this rule flagged 9
   * of 10 vehicles in the real fleet, and only one was a genuine conflict. A
   * warning that fires on nine good records buries the tenth, so the bar is
   * now: the label must share NOTHING with the structured model.
   *
   * The false positives were all the same model written differently —
   * "RX350" vs "rx 350", "Land Cruiser prado" vs "prado",
   * "Triton/L200/Strada" vs "triton".
   */
  const collapse = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const flatLabel = collapse(v.label);
  const flatModel = collapse(v.model);

  // "RX350" inside "LEXUS RX 350", or "prado" inside "Land Cruiser prado".
  if (flatModel && flatLabel.includes(flatModel)) return null;
  if (modelTokens.some(t => t.length > 2 && flatLabel.includes(t))) return null;
  // The label's own words appearing in the model: "triton" in
  // "Triton/L200/Strada", "cls" and "350" in "CLS 350 Blue Efficiency Coupe".
  if (tokens.some(t => t.length > 2 && flatModel.includes(t))) return null;

  /**
   * German series naming, which is a real convention rather than a special
   * case: a 750Li IS a 7 Series, and a C 200 IS a C-Class. So when the model
   * is a "<designation> Series/Class" and the label carries a designation
   * beginning with that same character, they agree.
   *
   * This is exactly what distinguishes the one true conflict from the noise:
   * "S-Class" against a label reading "200" shares no leading character, so
   * it still flags — correctly.
   */
  const seriesWord = modelTokens.find(t => ['series', 'class', 'klasse'].includes(t));
  if (seriesWord) {
    /**
     * Re-tokenised WITHOUT dropping single characters. The designation is
     * frequently one character — the "7" of "7 Series", the "S" of "S-Class"
     * — and the ordinary tokenizer discards those, which silently disabled
     * this whole rule for exactly the models it exists to serve.
     */
    const designation = v.model.toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
      .find(t => t && !['series', 'class', 'klasse'].includes(t));
    if (designation) {
      /**
       * The label's designation is a single character just as often — the
       * "C" of "C 200". Compared against tokens that keep single characters,
       * for the same reason the model side does.
       */
      const labelRaw = v.label.toLowerCase()
        .replace(/#\s*\d+/g, ' ').replace(/\b(19|20)\d{2}\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

      const head = designation[0];
      const agrees = labelRaw.some(t =>
        // The designation itself: "C" against a C-Class.
        t === designation
        // Or a numeric designation within the series: "750" in a 7 Series,
        // "530d" in a 5 Series. A digit is required so an unrelated word
        // sharing the first letter — "Sport" against an S-Class — does not
        // quietly clear a real disagreement.
        || (t.startsWith(head) && /\d/.test(t)));
      if (agrees) return null;
    }
  }

  /**
   * A label that simply omits the model is not a contradiction. "BIG BROTHER"
   * and "Land Rover #6889" say nothing about which model it is. Only a label
   * naming a DIFFERENT model of the SAME marque contradicts the record, which
   * requires the marque to appear in the label at all.
   */
  const makeTokens = v.make ? labelTokens(v.make) : [];
  const mentionsMake = makeTokens.length > 0 && makeTokens.every(t => tokens.includes(t));
  if (!mentionsMake) return null;

  /**
   * The marque is named and the model is not. That is only a contradiction if
   * the label names something model-shaped: a designation carrying a digit
   * ("C 200", "X5") or a word the marque's models use ("class", "coupe").
   * Otherwise it is a nickname sitting next to a brand.
   */
  const leftover = tokens.filter(t => !makeTokens.includes(t));
  const modelShaped = leftover.some(t => /\d/.test(t))
    || leftover.some(t => modelTokens.some(m => m === t));
  if (!modelShaped) return null;

  return {
    kind: 'display_vs_structured',
    field: 'model',
    currentValue: v.model,
    otherValue: leftover.join(' ').trim(),
    otherSource: 'display_label',
    detail: 'The display name and the structured model disagree. '
      + 'Structured fields decide parts identity; the label is not used.',
  };
}

/**
 * Contradictions inside the record itself, independent of any catalogue.
 *
 * Only checks that cannot be wrong: a displacement of 0.2 litres or 30
 * cylinders is a data-entry slip, not an unusual car.
 */
function internalConflicts(v: QualityVehicle): VehicleConflict[] {
  const out: VehicleConflict[] = [];

  if (present(v.displacementL) && (v.displacementL! < 0.5 || v.displacementL! > 12)) {
    out.push({
      kind: 'internal', field: 'displacementL',
      currentValue: `${v.displacementL} L`, otherValue: '0.5–12 L',
      otherSource: 'structured',
      detail: 'Displacement is outside the range of a road vehicle engine.',
    });
  }

  if (present(v.cylinders) && (v.cylinders! < 2 || v.cylinders! > 16)) {
    out.push({
      kind: 'internal', field: 'cylinders',
      currentValue: String(v.cylinders), otherValue: '2–16',
      otherSource: 'structured',
      detail: 'Cylinder count is outside the range of a road vehicle engine.',
    });
  }

  const year = Number(v.year);
  if (present(v.year) && (year < 1900 || year > new Date().getFullYear() + 2)) {
    out.push({
      kind: 'internal', field: 'year',
      currentValue: String(v.year), otherValue: `1900–${new Date().getFullYear() + 2}`,
      otherSource: 'structured',
      detail: 'Year is outside a plausible range.',
    });
  }

  return out;
}

/**
 * The whole picture for one vehicle.
 *
 * Catalogue comparison is deliberately NOT here: it needs a stored provider
 * mapping and lives in catalogComparison.ts, so this stays pure and callable
 * from anywhere including a browser.
 */
export function analyzeVehicleQuality(v: QualityVehicle): VehicleQuality {
  const missingFields: VehicleFieldGap[] = [];

  for (const f of CORE_IDENTITY_FIELDS) {
    if (!present(v[f])) {
      missingFields.push({ field: f, significance: 'CORE_IDENTITY', label: FIELD_LABEL[f] });
    }
  }
  for (const f of FITMENT_ENRICHMENT_FIELDS) {
    if (!present((v as unknown as Record<string, unknown>)[f])) {
      missingFields.push({ field: f, significance: 'FITMENT_ENRICHMENT', label: FIELD_LABEL[f] });
    }
  }

  const conflicts: VehicleConflict[] = [...internalConflicts(v)];
  const lc = labelConflict(v);
  if (lc) conflicts.push(lc);

  const filled = FITMENT_ENRICHMENT_FIELDS
    .filter(f => present((v as unknown as Record<string, unknown>)[f])).length;
  const completeness = filled / FITMENT_ENRICHMENT_FIELDS.length;

  const coreComplete = CORE_IDENTITY_FIELDS.every(f => present(v[f]));

  /**
   * A conflict outranks incompleteness: a record that contradicts itself is
   * a worse problem than one that is merely thin, and fixing the thin one
   * first would be filling in detail about possibly the wrong car.
   */
  const status: VehicleQualityStatus = conflicts.length > 0
    ? 'CONFLICT'
    : (coreComplete && filled === FITMENT_ENRICHMENT_FIELDS.length) ? 'COMPLETE' : 'INCOMPLETE';

  return {
    status,
    completeness,
    missingFields,
    conflicts,
    resolvable: coreComplete,
  };
}

/**
 * A sentence for a technician, naming the consequence rather than the state.
 *
 * "INCOMPLETE" tells someone nothing about what to do. This never says the
 * vehicle is invalid, because it is not.
 */
export function qualitySummary(q: VehicleQuality): string {
  if (q.status === 'CONFLICT') {
    return 'Vehicle information disagrees with itself — review before ordering parts.';
  }
  if (!q.resolvable) {
    return 'Year, make and model are needed before parts can be matched to this vehicle.';
  }
  if (q.status === 'INCOMPLETE') {
    return 'Vehicle record incomplete for precise parts matching.';
  }
  return 'Vehicle record is complete for parts matching.';
}
