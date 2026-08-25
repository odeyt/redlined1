import 'server-only';

/**
 * Searching the catalogue by DESCRIPTION against a resolved vehicle.
 *
 * ## What this endpoint actually returns
 *
 * Not articles. Proven by one controlled live call on 2026-08-25 against a
 * resolved Porsche Cayenne (92A): 186 rows, and every row carried exactly two
 * fields.
 *
 *     articleOemNo         186 distinct values   e.g. "7L0698151M"
 *     articleProductName     1 distinct value    "Brake Pad Set, disc brake"
 *
 * No brand. No supplier. No article id. No image. No price. No product group.
 *
 * The first version of this file assumed six fields that do not exist
 * (articleNo, supplierName, manufacturerName, s3image, productGroup,
 * articleId). The result on staging was 186 identical cards, each claiming
 * LIKELY FIT, none distinguishable from another, with a "Select this part"
 * button that a technician could only press at random. That is worse than no
 * feature, so it is gone.
 *
 * What this endpoint IS good for is real: it answers "which OEM numbers does
 * this vehicle take for this kind of part". An OEM number is exactly the
 * input the M-PARTS2A `oem_search` path already turns into brands, prices and
 * applicability. So this returns OEM REFERENCES, and the technician takes one
 * to the OEM search.
 *
 * ## Why this is not a fitment claim
 *
 * The provider does not state the returned set is exact for the resolved
 * variant, so membership yields no `verified` fitment and no fitment status
 * at all here — these are not parts, and a part is what fitment describes.
 */
import { logger } from '@/lib/logger';
import { autoPartsApiRequest } from '../providers/autopartsapi/client';
import {
  oemPartsForVehiclePath, AUTOPARTS_TYPE_ID, AUTOPARTS_ENGLISH_LANG_ID,
} from '../providers/autopartsapi/endpoints';
import { safeText } from '../normalize';
import { normalizePartNumber } from '../providers/autopartsapi/normalize';

/** One row of the vehicle OEM response. Two fields, both strings. */
export interface VehicleOemRow {
  articleOemNo?: string;
  articleProductName?: string;
  [key: string]: unknown;
}

/**
 * OEM numbers this vehicle takes, gathered under the part name the catalogue
 * filed them under.
 *
 * Grouped because the response repeats one product name across every row:
 * 186 rows of "Brake Pad Set, disc brake" is one answer with 186 part
 * numbers, not 186 answers.
 */
export interface VehicleOemGroup {
  productName: string;
  oemNumbers: string[];
  /** How well the product name answers what was typed. */
  relevance: 'high' | 'medium' | 'low';
}

export interface VehicleOemResult {
  groups: VehicleOemGroup[];
  totalOemNumbers: number;
  externalCalls: number;
}

function rowsOf(payload: unknown): VehicleOemRow[] {
  if (Array.isArray(payload)) return payload as VehicleOemRow[];
  for (const k of ['data', 'items', 'articles', 'result', 'results', 'parts']) {
    const v = (payload as Record<string, unknown>)?.[k];
    if (Array.isArray(v)) return v as VehicleOemRow[];
  }
  return [];
}

/**
 * How well a product name answers what was typed.
 *
 * Kept separate from part identity and from fitment — a brake disc is a
 * perfect part and a poor answer to "brake pads".
 *
 * Honest caveat learned live: this endpoint filters by the search term
 * server-side, so in practice nearly everything it returns scores `high`.
 * The score still earns its place — it is what catches the provider widening
 * a search, and it costs nothing — but it is not doing much sorting here.
 *
 * Deterministic token overlap. No model: a relevance number nobody can
 * explain is one nobody can argue with when it is wrong.
 */
export function searchRelevance(query: string, productName: string): 'high' | 'medium' | 'low' {
  /**
   * A trailing plural dropped, and nothing more.
   *
   * The catalogue writes "Brake Pad Set"; a technician types "brake pads".
   * Deliberately the crudest possible rule — one trailing "s", never on a
   * short word, never on a double "s" — because a real stemmer starts
   * merging words that are genuinely different parts.
   */
  const stem = (t: string) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t);

  const tokens = (s: string) => new Set(
    String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
      .filter(t => t.length > 2)
      .map(stem));

  const want = tokens(query);
  if (!want.size) return 'low';
  const have = tokens(productName);
  if (!have.size) return 'low';

  let hits = 0;
  for (const t of want) if (have.has(t)) hits += 1;

  const ratio = hits / want.size;
  if (ratio >= 0.75) return 'high';
  if (ratio > 0) return 'medium';
  return 'low';
}

export interface VehicleFirstSearchInput {
  shopId?: string;
  /** The provider variant this estimate's vehicle resolved to. */
  providerVehicleId: number;
  query: string;
}

/** Cap on OEM numbers kept per product group, so one query cannot flood the UI. */
const MAX_OEM_PER_GROUP = 60;

export async function searchOemNumbersForVehicle(
  input: VehicleFirstSearchInput,
): Promise<VehicleOemResult> {
  const payload = await autoPartsApiRequest<unknown>(
    oemPartsForVehiclePath({
      typeId: AUTOPARTS_TYPE_ID.passengerCar,
      vehicleId: input.providerVehicleId,
      langId: AUTOPARTS_ENGLISH_LANG_ID,
      searchParam: input.query,
    }),
    undefined,
    { shopId: input.shopId, category: 'vehicle_parts_search', callContext: 'application' },
  );

  const rows = rowsOf(payload);
  logger.info('parts_vehicle_first_search', { rows: rows.length });

  const byName = new Map<string, Set<string>>();
  for (const r of rows) {
    const name = safeText(r.articleProductName, 120);
    const oem = safeText(r.articleOemNo, 60);
    if (!name || !oem) continue;
    // Normalised so "7L0 698 151 M" and "7L0698151M" are one number.
    const key = normalizePartNumber(oem);
    if (!key) continue;
    const set = byName.get(name) ?? new Set<string>();
    set.add(oem.toUpperCase());
    byName.set(name, set);
  }

  const groups: VehicleOemGroup[] = [...byName.entries()]
    .map(([productName, set]) => ({
      productName,
      oemNumbers: [...set].sort().slice(0, MAX_OEM_PER_GROUP),
      relevance: searchRelevance(input.query, productName),
    }))
    // Best answer to what was typed first, then the richest group.
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 } as const;
      return rank[a.relevance] - rank[b.relevance]
        || b.oemNumbers.length - a.oemNumbers.length
        || a.productName.localeCompare(b.productName);
    });

  return {
    groups,
    totalOemNumbers: groups.reduce((n, g) => n + g.oemNumbers.length, 0),
    externalCalls: 1,
  };
}
