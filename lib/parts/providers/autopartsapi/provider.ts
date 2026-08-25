import 'server-only';

/**
 * AutoPartsAPI as a Redlined1 parts provider.
 *
 * It occupies the existing `catalog` slot rather than adding a registry entry:
 * the OEM cross-reference abstraction already exists and this is an
 * implementation of it.
 *
 * ## What it searches, and what it does not
 *
 * The OEM number is the query. `search-by-article-oem-no` is the primary
 * endpoint, and it answers "which aftermarket articles correspond to this OEM
 * number" — which is the question a parts counter actually asks.
 *
 * Free-text search for a KNOWN vehicle exists in the API
 * (`selecting-oem-parts-vehicle-modification-description-product-group`) and
 * is NOT wired, because it needs a provider `vehicle-id` and Redlined1 holds
 * VINs and labels, not this provider's vehicle ids. Resolving one is its own
 * piece of work with its own quota cost. So a search with no OEM number
 * returns nothing here rather than guessing an id — eBay already covers
 * free-text, and a catalogue guessing at a vehicle is worse than a catalogue
 * staying quiet.
 *
 * ## Quota
 *
 * ONE call per search in the normal case. Applicability is fetched only when
 * an OEM search actually returned articles AND the estimate has a vehicle to
 * check against, because an applicability list with nothing to compare it to
 * is a call spent for nothing.
 */
import { logger } from '@/lib/logger';
import { autoPartsApiRequest, hasCredentials } from './client';
import {
  SEARCH_BY_OEM, searchByOemQuery, equalOemPath, aftermarketCrossRefPath,
  vehicleApplicabilityPath, toAutoPartsTypeId, AUTOPARTS_ENGLISH_LANG_ID,
} from './endpoints';
import { normalizeAutoPartsResponse, extractApplicability } from './normalize';
import { buildVerdict, type EvidenceItem, type VehicleApplicability } from './evidence';
import type {
  NormalizedPartResult, PartsProvider, PartsSearchInput, ProviderHealth,
} from '../../types';

export function autoPartsApiHealth(): ProviderHealth {
  if (!hasCredentials()) {
    return {
      id: 'catalog',
      name: 'AutoPartsAPI catalogue',
      enabled: false,
      status: 'missing_credentials',
      reason: 'AUTOPARTS_API_KEY is not configured for this environment.',
    };
  }
  return { id: 'catalog', name: 'AutoPartsAPI catalogue', enabled: true, status: 'ready' };
}

/** The OEM number this search is about, if any. */
function oemFor(input: PartsSearchInput): string | null {
  const explicit = (input.oemNumber ?? '').trim();
  if (explicit) return explicit;

  // A query that IS an OEM number is common — a technician pastes it into the
  // search box. Accepted only when the whole query looks like a part number,
  // never when it is prose like "front brake pads".
  const q = (input.query ?? '').trim();
  if (/^[A-Za-z0-9][A-Za-z0-9._-]{4,29}$/.test(q) && /\d/.test(q)) return q;

  return null;
}

export const autoPartsApiProvider: PartsProvider = {
  id: 'catalog',
  name: 'AutoPartsAPI catalogue',

  enabled() {
    return autoPartsApiHealth().enabled;
  },

  health: autoPartsApiHealth,

  async searchParts(input: PartsSearchInput): Promise<NormalizedPartResult[]> {
    if (!this.enabled()) return [];

    const oem = oemFor(input);
    if (!oem) {
      // Not a failure. This provider answers OEM questions; a free-text
      // search is eBay's job until vehicle-id resolution exists.
      logger.info('parts.autopartsapi.skipped_no_oem', {});
      return [];
    }

    const checkedAt = new Date().toISOString();

    // ── 1. The one call every OEM search makes ──────────────────────────────
    // Application traffic. This is the lookup a technician triggers, and it
    // was the biggest hole in the old accounting: it passed no context, so
    // every OEM search a shop ever ran was invisible in the monthly figure.
    const payload = await autoPartsApiRequest<unknown>(
      SEARCH_BY_OEM, searchByOemQuery(oem, AUTOPARTS_ENGLISH_LANG_ID),
      { shopId: input.shopId, category: 'oem_search', callContext: 'application' });

    const articles = normalizeAutoPartsResponse(payload, input, { checkedAt });
    if (!articles.length) return [];

    // ── 2. Applicability, only when it can actually be checked ──────────────
    let applicability: VehicleApplicability[] = [];
    const canCheckVehicle = Boolean(input.make && input.model);
    const manufacturerId = Number((input as { manufacturerId?: number }).manufacturerId);

    if (canCheckVehicle && Number.isInteger(manufacturerId) && manufacturerId > 0) {
      try {
        const applicabilityPayload = await autoPartsApiRequest<unknown>(
          vehicleApplicabilityPath({
            typeId: toAutoPartsTypeId('car'),
            manufacturerId,
            oem,
          }),
          undefined,
          { shopId: input.shopId, category: 'oem_applicability', callContext: 'application' });
        applicability = extractApplicability(applicabilityPayload);
      } catch {
        // A failed applicability lookup costs the VERIFIED claim, not the
        // search. The articles are still useful.
        logger.warn('parts.autopartsapi.applicability_failed', {});
      }
    }

    // ── 3. Evidence per article ─────────────────────────────────────────────
    return articles.map(article => {
      const evidence: EvidenceItem[] = [{
        kind: 'exact_oem',
        detail: `Returned by the catalogue for OEM number ${oem}.`,
        source: 'articles-oem',
      }];

      if (article.manufacturerPartNumber
        && (input.manufacturerPartNumber ?? '').trim().toUpperCase()
          === article.manufacturerPartNumber.toUpperCase()) {
        evidence.push({
          kind: 'mpn_relation',
          detail: `Manufacturer part number matches ${article.manufacturerPartNumber}.`,
          source: 'articles-oem',
        });
      }

      if (applicability.length) {
        evidence.push({
          kind: 'vehicle_applicability',
          detail: `Catalogue lists ${applicability.length} vehicle application(s) for this number.`,
          source: 'articles-oem',
        });
      }

      const verdict = buildVerdict({
        evidence,
        applicability,
        vehicle: { make: input.make, model: input.model, year: input.year },
      });

      // The marque reason must survive.
      //
      // buildVerdict answers "does the catalogue list this part for this
      // vehicle", and with no applicability records its answer is the generic
      // "no applicability listed". That was overwriting the far more useful
      // thing normalize() already worked out — that the row is filed under
      // CHRYSLER while the estimate is a Mercedes. Both are true; the
      // marque-specific one is what tells a technician to move on.
      const marqueMismatch = Boolean(
        article.vehicleManufacturer && input.make
        && article.fitmentReason?.includes('collide across marques'),
      );

      return {
        ...article,
        fitmentStatus: verdict.fitmentStatus,
        fitmentReason: marqueMismatch && !applicability.length
          ? article.fitmentReason
          : verdict.fitmentReason,
      };
    });
  },
};

/**
 * Deeper evidence for ONE article the technician is looking at.
 *
 * Deliberately not part of `searchParts`: running it per result would turn one
 * search into a dozen calls and empty a free-tier month in an afternoon. It is
 * called on demand, for a single article, when someone wants to know why.
 */
export async function fetchDeepEvidence(oem: string, shopId?: string): Promise<EvidenceItem[]> {
  if (!hasCredentials()) return [];
  const evidence: EvidenceItem[] = [];

  const [equal, cross] = await Promise.allSettled([
    autoPartsApiRequest<unknown>(equalOemPath(oem), undefined,
      { shopId, category: 'cross_reference', callContext: 'application' }),
    autoPartsApiRequest<unknown>(aftermarketCrossRefPath(oem), undefined,
      { shopId, category: 'cross_reference', callContext: 'application' }),
  ]);

  const count = (r: PromiseSettledResult<unknown>): number => {
    if (r.status !== 'fulfilled') return 0;
    const v = r.value as { data?: unknown[]; items?: unknown[] };
    if (Array.isArray(r.value)) return (r.value as unknown[]).length;
    if (Array.isArray(v?.data)) return v.data.length;
    if (Array.isArray(v?.items)) return v.items.length;
    return 0;
  };

  const equalCount = count(equal);
  if (equalCount) {
    evidence.push({
      kind: 'equal_oem',
      detail: `${equalCount} equal OEM reference(s) confirmed by the catalogue.`,
      source: 'articles-oem',
    });
  }

  const crossCount = count(cross);
  if (crossCount) {
    evidence.push({
      kind: 'cross_reference',
      detail: `${crossCount} aftermarket cross-reference(s) published for this OEM number.`,
      source: 'artlookup',
    });
  }

  return evidence;
}
