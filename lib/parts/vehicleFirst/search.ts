import 'server-only';

/**
 * Searching the catalogue for a part by DESCRIPTION, against a resolved vehicle.
 *
 * ## Why this exists
 *
 * Until now a technician needed an OEM number before Redlined1 could help.
 * That is backwards: the number is what they are trying to find. This asks
 * the question they actually have — "front brake pads for this car" — and the
 * vehicle is already known, because the estimate names it.
 *
 * ## What it does NOT do to fitment
 *
 * The endpoint is vehicle-scoped, so it is tempting to call everything it
 * returns a verified fit. That is not established: the provider documents it
 * as parts for a vehicle modification, and we have not proven the returned
 * set is exact for the resolved variant rather than broadly for the model.
 *
 * So membership of a vehicle-scoped result set is recorded as its own kind of
 * evidence — `vehicle_catalog_result` — and it produces `likely`, not
 * `verified`. Only OEM applicability, which we HAVE matched against a
 * specific variant, produces `verified`. If a live run later proves the
 * contract is exact, the upgrade is one line in the evidence table and a
 * documented reason, not a quiet change of meaning.
 */
import { logger } from '@/lib/logger';
import { autoPartsApiRequest } from '../providers/autopartsapi/client';
import {
  oemPartsForVehiclePath, AUTOPARTS_TYPE_ID, AUTOPARTS_ENGLISH_LANG_ID,
} from '../providers/autopartsapi/endpoints';
import { safeText, safeHttpsUrl } from '../normalize';
import { normalizePartNumber } from '../providers/autopartsapi/normalize';
import type { NormalizedPartResult } from '../types';

/** One article from the vehicle-scoped catalogue response. Loosely typed. */
export interface VehiclePartRow {
  articleId?: number | string;
  articleNo?: string;
  articleProductName?: string;
  supplierName?: string;
  supplierId?: number | string;
  manufacturerName?: string;
  s3image?: string;
  articleMediaFileName?: string;
  /** The provider's own grouping — "Brake Pad Set", "Brake Disc". */
  productGroup?: string;
  productGroupName?: string;
  productGroupId?: number | string;
  oemNumbers?: string[];
  oem?: string | string[];
  [key: string]: unknown;
}

export interface VehiclePartsResult {
  results: NormalizedPartResult[];
  /**
   * Provider product groups present in the response.
   *
   * Derived from what came back rather than fetched from a category endpoint
   * — there is no documented category-listing endpoint, and inventing a
   * Redlined1-to-provider category map without one would be exactly the kind
   * of guess this milestone forbids. Grouping real results by the group the
   * provider put them in costs nothing and invents nothing.
   */
  productGroups: Array<{ id?: string; name: string; count: number }>;
  externalCalls: number;
}

function rowsOf(payload: unknown): VehiclePartRow[] {
  if (Array.isArray(payload)) return payload as VehiclePartRow[];
  for (const k of ['data', 'items', 'articles', 'result', 'results', 'parts']) {
    const v = (payload as Record<string, unknown>)?.[k];
    if (Array.isArray(v)) return v as VehiclePartRow[];
  }
  return [];
}

function collectOem(r: VehiclePartRow): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    const s = safeText(v, 60);
    if (s) out.push(s.toUpperCase());
  };
  if (Array.isArray(r.oemNumbers)) r.oemNumbers.forEach(push);
  if (Array.isArray(r.oem)) r.oem.forEach(push);
  else if (typeof r.oem === 'string') push(r.oem);
  return [...new Set(out)].slice(0, 25);
}

function groupName(r: VehiclePartRow): string | undefined {
  return safeText(r.productGroupName ?? r.productGroup, 80);
}

/**
 * How well a result answers what was typed.
 *
 * Kept SEPARATE from part identity and from fitment, because it answers a
 * third question: "is this the kind of part I asked for". A brake disc is a
 * perfect part, perfectly fitted, and a poor answer to "brake pads".
 *
 * Deterministic token overlap. No similarity score and no model — a relevance
 * number that cannot be explained is one nobody can argue with when it is
 * wrong.
 */
export function searchRelevance(query: string, row: VehiclePartRow): 'high' | 'medium' | 'low' {
  /**
   * A trailing plural dropped, and nothing more.
   *
   * The catalogue writes "Brake Pad Set"; a technician types "brake pads".
   * Without this the commonest search in a workshop scores medium against a
   * perfect answer. Deliberately the crudest possible rule — one trailing
   * "s", never on a short word, never on a double "s" — because a real
   * stemmer starts merging words that are genuinely different parts.
   */
  const stem = (t: string) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t);

  const tokens = (s: string) => new Set(
    String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
      .filter(t => t.length > 2)
      .map(stem));

  const want = tokens(query);
  if (!want.size) return 'low';

  const haveText = [row.articleProductName, groupName(row)].filter(Boolean).join(' ');
  const have = tokens(haveText);
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
  currency?: string;
  /** Only results in this provider product group, when browsing. */
  productGroup?: string;
}

export async function searchPartsForVehicle(
  input: VehicleFirstSearchInput,
): Promise<VehiclePartsResult> {
  const checkedAt = new Date().toISOString();

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

  const groups = new Map<string, { id?: string; name: string; count: number }>();
  const results: NormalizedPartResult[] = [];
  const seen = new Set<string>();

  for (const r of rows) {
    const title = safeText(r.articleProductName, 200);
    if (!title) continue;

    const mpn = safeText(r.articleNo, 80);
    const brand = safeText(r.supplierName, 80);

    // Group only where BOTH a brand and a part number exist. Two rows that
    // merely look alike are not one part — the same description under two
    // suppliers is two products.
    const key = mpn && brand
      ? `${normalizePartNumber(brand)}::${normalizePartNumber(mpn)}`
      : `id::${String(r.articleId ?? Math.random())}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const g = groupName(r);
    if (g) {
      const existing = groups.get(g);
      if (existing) existing.count += 1;
      else groups.set(g, { id: safeText(r.productGroupId, 40), name: g, count: 1 });
    }

    if (input.productGroup && g !== input.productGroup) continue;

    results.push({
      provider: 'catalog',
      providerListingId: safeText(String(r.articleId ?? ''), 80),
      title,
      brand,
      manufacturerPartNumber: mpn,
      oemNumbers: collectOem(r).length ? collectOem(r) : undefined,
      imageUrl: safeHttpsUrl(r.s3image),
      vehicleManufacturer: safeText(r.manufacturerName, 80),
      currency: input.currency ?? 'USD',
      // A catalogue publishes identity, not offers. Unchanged from M-PARTS2A.
      itemPrice: undefined,
      shippingCost: undefined,
      estimatedTax: null,
      estimatedImportDuty: null,
      landedCost: undefined,
      landedCostCompleteness: 'unknown',
      // LIKELY, never verified. See the note at the top of this file.
      fitmentStatus: 'likely',
      fitmentReason: 'Returned by the catalogue for the resolved vehicle variant. '
        + 'The provider does not state this list is exact for that variant, so fitment '
        + 'is not confirmed.',
      sourceCheckedAt: checkedAt,
    });
  }

  return {
    results,
    productGroups: [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    externalCalls: 1,
  };
}
