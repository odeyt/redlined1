/**
 * Flattening a provider's response into NormalizedPartResult.
 *
 * Two jobs, and the second one matters more than it looks: everything a
 * marketplace returns is UNTRUSTED INPUT. A listing title is written by a
 * stranger and lands in our UI, so it is length-bounded and stripped of
 * control characters here, at the boundary, rather than being trusted because
 * React usually escapes it. Provider URLs are checked against an https
 * allow-list so a hostile listing cannot hand us a `javascript:` href or a
 * link to an internal address.
 */
import { calculateLandedCost } from './landedCost';
import {
  fitmentFromEbayCompatibility, describeVehicle, hasVehicleContext,
} from './fitment';
import type { NormalizedPartResult, PartsSearchInput } from './types';

const MAX_TITLE = 200;
const MAX_TEXT = 1000;

/** Untrusted text from a marketplace, made safe to render and to store. */
export function safeText(raw: unknown, max = MAX_TEXT): string | undefined {
  if (typeof raw !== 'string') return undefined;

  let out = '';
  for (const ch of raw) {
    const c = ch.codePointAt(0) ?? 0;
    const isControl = c <= 0x1f || c === 0x7f;
    // Zero-width and bidi overrides. These let a listing DISPLAY as one
    // thing while STORING another, which is how a title reads "Genuine
    // Toyota" on screen and carries something else into the estimate.
    const isBidiOrZeroWidth =
      (c >= 0x200b && c <= 0x200f) ||
      (c >= 0x202a && c <= 0x202e) ||
      (c >= 0x2066 && c <= 0x2069);
    out += (isControl || isBidiOrZeroWidth) ? ' ' : ch;
  }

  const cleaned = out.split(/\s+/).join(' ').trim();
  if (!cleaned) return undefined;
  return cleaned.length > max ? cleaned.slice(0, max).trimEnd() + '…' : cleaned;
}

/**
 * A provider URL we are willing to put in an href or an <img src>.
 *
 * https only, and no credentials in the URL. Anything else is dropped rather
 * than sanitised — a link we cannot vouch for is not worth rendering, and
 * "fixing" a hostile URL tends to produce a different hostile URL.
 */
export function safeHttpsUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length > 2048) return undefined;
  let u: URL;
  try { u = new URL(raw); } catch { return undefined; }
  if (u.protocol !== 'https:') return undefined;
  if (u.username || u.password) return undefined;
  return u.toString();
}

function num(raw: unknown): number | undefined {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

// ─── eBay Browse API ─────────────────────────────────────────────────────────

/**
 * The subset of eBay's itemSummary we read. Typed loosely on purpose: this is
 * someone else's payload and a missing field is normal, not exceptional.
 */
export interface EbayItemSummary {
  itemId?: string;
  title?: string;
  shortDescription?: string;
  brand?: string;
  mpn?: string;
  image?: { imageUrl?: string };
  thumbnailImages?: Array<{ imageUrl?: string }>;
  itemWebUrl?: string;
  itemAffiliateWebUrl?: string;
  price?: { value?: string | number; currency?: string };
  shippingOptions?: Array<{
    shippingCost?: { value?: string | number; currency?: string };
    minEstimatedDeliveryDate?: string;
    maxEstimatedDeliveryDate?: string;
  }>;
  condition?: string;
  seller?: { username?: string; feedbackPercentage?: string | number; feedbackScore?: number };
  estimatedAvailabilities?: Array<{ estimatedAvailabilityStatus?: string }>;
  compatibilityMatch?: string;
  localizedAspects?: Array<{ name?: string; value?: string }>;
}

/**
 * eBay's seller feedback is a percentage string ("98.6"). Normalised to 0–1 so
 * a future provider scoring out of five does not silently outrank it.
 */
function normalizeSellerRating(pct: unknown): number | undefined {
  const n = num(pct);
  if (n === undefined) return undefined;
  if (n < 0 || n > 100) return undefined;
  return Number((n / 100).toFixed(4));
}

function aspect(item: EbayItemSummary, name: string): string | undefined {
  const hit = (item.localizedAspects ?? []).find(
    a => (a.name ?? '').toLowerCase() === name.toLowerCase(),
  );
  return safeText(hit?.value, 120);
}

export function normalizeEbayItem(
  item: EbayItemSummary,
  input: PartsSearchInput,
  opts: { checkedAt: string; defaultCurrency?: string },
): NormalizedPartResult | null {
  const title = safeText(item.title, MAX_TITLE);
  // A result with no title cannot be shown or chosen. Dropped rather than
  // rendered as an empty card the technician might click.
  if (!title) return null;

  const itemPrice = num(item.price?.value);
  const currency =
    safeText(item.price?.currency, 8) ?? opts.defaultCurrency ?? input.currency ?? 'USD';

  // eBay returns shipping options as an array; the first is the default one
  // the buyer gets. `undefined` (no options at all) is unknown, but an option
  // whose cost is 0 is genuinely free shipping — those must not collapse.
  const firstShipping = (item.shippingOptions ?? [])[0];
  const shippingCost = firstShipping ? num(firstShipping.shippingCost?.value) : undefined;

  const mpn = safeText(item.mpn, 80);
  const vehicleLabel = describeVehicle(input);
  const askedMpn = (input.manufacturerPartNumber ?? '').trim().toUpperCase();
  const hasMpnMatch = Boolean(askedMpn && mpn && mpn.toUpperCase() === askedMpn);

  const fitment = fitmentFromEbayCompatibility(item.compatibilityMatch, {
    hasVehicleContext: hasVehicleContext(input),
    vehicleLabel,
    hasMpnMatch,
  });

  // Tax and duty are genuinely unknown from a Browse response. Left null so
  // the landed cost reports itself as partial rather than pretending.
  const landed = calculateLandedCost({
    itemPrice,
    shippingCost,
    estimatedTax: null,
    estimatedImportDuty: null,
  });

  return {
    provider: 'ebay',
    providerListingId: safeText(item.itemId, 80),
    title,
    description: safeText(item.shortDescription),
    brand: safeText(item.brand, 80),
    manufacturerPartNumber: mpn,
    imageUrl: safeHttpsUrl(item.image?.imageUrl ?? item.thumbnailImages?.[0]?.imageUrl),
    productUrl: safeHttpsUrl(item.itemWebUrl),
    // Only present when the account is enrolled; eBay omits it otherwise.
    affiliateUrl: safeHttpsUrl(item.itemAffiliateWebUrl),
    currency,
    itemPrice: landed.itemPrice ?? undefined,
    shippingCost: landed.shippingCost ?? undefined,
    estimatedTax: landed.estimatedTax,
    estimatedImportDuty: landed.estimatedImportDuty,
    landedCost: landed.landedCost ?? undefined,
    landedCostCompleteness: landed.completeness,
    availability: safeText(item.estimatedAvailabilities?.[0]?.estimatedAvailabilityStatus, 60),
    condition: safeText(item.condition, 60),
    sellerName: safeText(item.seller?.username, 80),
    sellerRating: normalizeSellerRating(item.seller?.feedbackPercentage),
    estimatedDeliveryStart: safeText(firstShipping?.minEstimatedDeliveryDate, 40),
    estimatedDeliveryEnd: safeText(firstShipping?.maxEstimatedDeliveryDate, 40),
    warranty: aspect(item, 'Warranty'),
    fitmentStatus: fitment.status,
    fitmentReason: fitment.reason,
    sourceCheckedAt: opts.checkedAt,
  };
}

export function normalizeEbayResponse(
  payload: { itemSummaries?: EbayItemSummary[] } | null | undefined,
  input: PartsSearchInput,
  opts: { checkedAt: string; defaultCurrency?: string },
): NormalizedPartResult[] {
  const items = payload?.itemSummaries ?? [];
  if (!Array.isArray(items)) return [];
  return items
    .map(i => normalizeEbayItem(i, input, opts))
    .filter((r): r is NormalizedPartResult => r !== null);
}
