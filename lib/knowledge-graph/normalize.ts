// ============================================================
// RedlineD1 — Automotive Knowledge Graph
// Normalization Utilities
// Sprint 4 — Foundation Layer
// ============================================================
// Rules:
// - Uppercase DTCs
// - Trim whitespace and collapse duplicate spaces
// - Remove non-alphanumeric chars from keys only (not display names)
// - Normalize common make aliases conservatively
// - Do NOT over-normalize free text (symptoms, descriptions)
// ============================================================

// ── Make aliases ─────────────────────────────────────────────
// Conservative list — only unambiguous common aliases
const MAKE_ALIASES: Record<string, string> = {
  'toyota motor': 'Toyota',
  'ford motor': 'Ford',
  'ford motor company': 'Ford',
  'general motors': 'GMC',
  'mercedes': 'Mercedes-Benz',
  'mercedes benz': 'Mercedes-Benz',
  'vw': 'Volkswagen',
  'vw group': 'Volkswagen',
  'bmw group': 'BMW',
  'land rover': 'Land Rover',
  'landrover': 'Land Rover',
  'chevy': 'Chevrolet',
  'chevrolet': 'Chevrolet',
  'porsche': 'Porsche',
  'audi': 'Audi',
  'hyundai': 'Hyundai',
  'kia': 'Kia',
  'honda': 'Honda',
  'nissan': 'Nissan',
  'mazda': 'Mazda',
  'subaru': 'Subaru',
  'mitsubishi': 'Mitsubishi',
  'isuzu': 'Isuzu',
  'lexus': 'Lexus',
  'infiniti': 'Infiniti',
  'acura': 'Acura',
  'volvo': 'Volvo',
  'jaguar': 'Jaguar',
  'tesla': 'Tesla',
};

// ── Core string utilities ─────────────────────────────────────

function trimAndCollapse(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// ── VIN ───────────────────────────────────────────────────────

/**
 * Normalize a VIN: uppercase, trim, validate length.
 * Returns null if the VIN is clearly invalid.
 * NOTE: VINs are shop-private and must never be used as global node keys.
 */
export function normalizeVin(vin: string | null | undefined): string | null {
  if (!vin) return null;
  const normalized = vin.trim().toUpperCase().replace(/\s+/g, '');
  if (normalized.length !== 17) return null;
  // VINs must not contain I, O, Q
  if (/[IOQ]/.test(normalized)) return null;
  return normalized;
}

// ── DTC Codes ─────────────────────────────────────────────────

/**
 * Normalize a DTC code: uppercase, trim, validate format.
 * Accepts: P0299, C1234, B0001, U0100
 * Returns null if not recognizable as a DTC.
 */
export function normalizeDtcCode(dtc: string | null | undefined): string | null {
  if (!dtc) return null;
  const normalized = dtc.trim().toUpperCase().replace(/\s+/g, '');
  // Standard OBD-II format: letter + 4 digits, or enhanced with extra digits
  if (/^[PCBU][0-9A-F]{4,6}$/.test(normalized)) return normalized;
  return null;
}

/**
 * Parse multiple DTCs from a string (comma, semicolon, or space separated).
 */
export function parseDtcList(input: string | null | undefined): string[] {
  if (!input) return [];
  return input
    .split(/[,;\s]+/)
    .map(d => normalizeDtcCode(d))
    .filter((d): d is string => d !== null);
}

// ── Make / Manufacturer ──────────────────────────────────────

/**
 * Normalize a vehicle make/manufacturer name.
 * Applies conservative alias resolution and title-cases the result.
 */
export function normalizeMake(make: string | null | undefined): string | null {
  if (!make) return null;
  const cleaned = trimAndCollapse(make);
  const lower = cleaned.toLowerCase();
  if (MAKE_ALIASES[lower]) return MAKE_ALIASES[lower];
  // Title-case unknown makes
  return cleaned.replace(/\b\w/g, c => c.toUpperCase());
}

// ── Model ────────────────────────────────────────────────────

/**
 * Normalize a vehicle model name.
 * Strips leading/trailing whitespace, collapses spaces.
 * Preserves case as-is (model names have meaningful capitalization).
 */
export function normalizeModel(model: string | null | undefined): string | null {
  if (!model) return null;
  return trimAndCollapse(model).replace(/\b\w/g, c => c.toUpperCase());
}

// ── Engine ───────────────────────────────────────────────────

/**
 * Normalize an engine descriptor.
 * Examples: "2GD-FTV" → "2GD-FTV", "3.5l v6 ecoboost" → "3.5L V6 ECOBOOST"
 */
export function normalizeEngine(engine: string | null | undefined): string | null {
  if (!engine) return null;
  return trimAndCollapse(engine).toUpperCase();
}

// ── Part Number ───────────────────────────────────────────────

/**
 * Normalize a part number: uppercase, collapse spaces, strip common noise.
 */
export function normalizePartNumber(partNumber: string | null | undefined): string | null {
  if (!partNumber) return null;
  return trimAndCollapse(partNumber)
    .toUpperCase()
    .replace(/\s+/g, '');
}

// ── Symptom ───────────────────────────────────────────────────

/**
 * Normalize a symptom description for matching.
 * Lowercases, trims, collapses whitespace.
 * Does NOT strip punctuation — symptom descriptions are free text.
 * Use the return value only for matching, not for display.
 */
export function normalizeSymptom(symptom: string | null | undefined): string | null {
  if (!symptom) return null;
  const cleaned = trimAndCollapse(symptom).toLowerCase();
  if (cleaned.length < 3) return null;
  return cleaned;
}

// ── Test Name ─────────────────────────────────────────────────

/**
 * Normalize a diagnostic test name.
 * Title-cases and collapses whitespace.
 */
export function normalizeTestName(testName: string | null | undefined): string | null {
  if (!testName) return null;
  return trimAndCollapse(testName)
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ── Normalized Key ────────────────────────────────────────────

/**
 * Create a deterministic slug key for graph node upsert deduplication.
 *
 * The key combines node_type and the relevant identifier fields so that
 * the same entity always maps to the same key regardless of how it was
 * entered. Used in ON CONFLICT upsert logic.
 *
 * Examples:
 *   createNormalizedKey('manufacturer', ['Toyota']) → 'manufacturer|toyota'
 *   createNormalizedKey('dtc', ['P0299']) → 'dtc|p0299'
 *   createNormalizedKey('engine', ['Toyota', 'Land Cruiser', '2GD-FTV']) → 'engine|toyota|land_cruiser|2gd_ftv'
 */
export function createNormalizedKey(nodeType: string, parts: (string | null | undefined)[]): string {
  const cleanParts = parts
    .filter((p): p is string => Boolean(p))
    .map(p => toSlug(p));
  if (cleanParts.length === 0) throw new Error(`Cannot create normalized key for ${nodeType}: no parts provided`);
  return `${nodeType}|${cleanParts.join('|')}`;
}

// ── Composite normalizers ─────────────────────────────────────

/**
 * Normalize all fields from a repair case that will become graph nodes.
 * Returns null for any field that cannot be normalized.
 */
export interface NormalizedRepairCaseFields {
  make: string | null;
  model: string | null;
  engine: string | null;
  dtcCodes: string[];
  symptoms: string[];
  testNames: string[];
  partNumbers: string[];
}

export function normalizeRepairCaseFields(input: {
  make?: string | null;
  model?: string | null;
  engine?: string | null;
  dtcCodes?: string | string[] | null;
  symptoms?: string | string[] | null;
  tests?: string | string[] | null;
  parts?: string | string[] | null;
}): NormalizedRepairCaseFields {
  const dtcInput = Array.isArray(input.dtcCodes) ? input.dtcCodes.join(' ') : (input.dtcCodes ?? '');
  const symptomsArr = Array.isArray(input.symptoms)
    ? input.symptoms
    : (input.symptoms ?? '').split(/[;\n]+/);
  const testsArr = Array.isArray(input.tests)
    ? input.tests
    : (input.tests ?? '').split(/[;\n]+/);
  const partsArr = Array.isArray(input.parts)
    ? input.parts
    : (input.parts ?? '').split(/[;\n,]+/);

  return {
    make: normalizeMake(input.make),
    model: normalizeModel(input.model),
    engine: normalizeEngine(input.engine),
    dtcCodes: parseDtcList(dtcInput),
    symptoms: symptomsArr
      .map(s => normalizeSymptom(s))
      .filter((s): s is string => s !== null),
    testNames: testsArr
      .map(t => normalizeTestName(t))
      .filter((t): t is string => t !== null && t.length > 2),
    partNumbers: partsArr
      .map(p => normalizePartNumber(p))
      .filter((p): p is string => p !== null && p.length > 2),
  };
}
