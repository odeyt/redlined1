/**
 * Freezing what a part cost at the moment it was quoted.
 *
 * ## The rule
 *
 * An estimate is a promise to a customer. If its total moved because a seller
 * changed a price overnight, the shop would be quoting one number and billing
 * another, and nobody would know which was agreed. So the moment a marketplace
 * result is added to an estimate it stops being a live listing and becomes a
 * RECORD OF WHAT IT COST THEN.
 *
 * Nothing in the estimate ever re-reads a provider. `refreshQuote` exists, is
 * called only by an explicit technician action, and RETURNS a comparison — it
 * cannot write. Updating the line is a separate, deliberate step.
 *
 * ## Where it lives, and why there is no migration
 *
 * `estimates.lines` is a JSONB array and `EstimateLine` is its element. The
 * snapshot rides inside the line under `partsSource`, exactly as the parts
 * `unit` rides inside `line_items`. That means:
 *
 *   - no new table, so no new RLS policy and no new way to leak across shops
 *   - existing rows are untouched and simply have no `partsSource`
 *   - the estimate's existing shop_id policy already covers it
 *
 * Adding typed columns would have meant a migration on a live table for data
 * that is procurement metadata, not money the totals depend on.
 *
 * ## It is metadata, never arithmetic
 *
 * `calculateEstimateTotals` multiplies `qty × rate` and knows nothing about
 * this object. The snapshot records where the number came from; the canonical
 * money model decides what the customer pays. That separation is the reason
 * this feature cannot move an estimate total by accident.
 */
import { round2, sellPriceFromMarkup } from './landedCost';
import type { FitmentStatus, NormalizedPartResult, PartsProviderId } from './types';

export type MarkupType = 'percentage' | 'fixed' | 'manual';

/**
 * The frozen record. Every field is what the provider said AT `sourceCheckedAt`,
 * not what it says now.
 */
export interface PartsSourceSnapshot {
  sourceProvider: PartsProviderId;
  sourceListingId?: string;
  /** ISO. The instant the price was true. Drives "quoted on…" in the UI. */
  sourceCheckedAt: string;

  sourceItemPrice: number | null;
  sourceShippingCost: number | null;
  sourceTax: number | null;
  sourceImportDuty: number | null;
  sourceCurrency: string;

  landedCost: number | null;
  landedCostCompleteness: 'complete' | 'partial' | 'unknown';

  brand?: string;
  manufacturerPartNumber?: string;
  oemNumbers?: string[];

  imageUrl?: string;
  productUrl?: string;
  affiliateUrl?: string;

  fitmentStatus: FitmentStatus;
  fitmentReason?: string;

  markupType: MarkupType;
  markupValue: number;

  /** What the customer is quoted per unit. The estimate's own `rate`. */
  sellUnitPrice: number;

  /** Set only when a technician explicitly refreshed and accepted new pricing. */
  refreshedAt?: string;
}

/** An estimate line carrying an optional snapshot. Mirrors EstimateLine. */
export interface PartsSourcedLine {
  note: string;
  description: string;
  laoDescription?: string;
  qty: number;
  rate: number;
  cost?: number;
  markup?: number;
  currency?: string;
  partsSource?: PartsSourceSnapshot;
}

export interface BuildLineInput {
  part: NormalizedPartResult;
  qty: number;
  markupType: MarkupType;
  /** Percent for 'percentage', an absolute amount for 'fixed', the price for 'manual'. */
  markupValue: number;
  /** Estimate currency, for the line. */
  currency?: string;
}

/** The unit sell price for a markup choice. One place, so the three agree. */
export function sellPriceFor(
  landedCost: number,
  markupType: MarkupType,
  markupValue: number,
): number {
  switch (markupType) {
    case 'percentage': return sellPriceFromMarkup(landedCost, markupValue);
    case 'fixed': return round2(landedCost + (Number.isFinite(markupValue) ? markupValue : 0));
    // The technician typed the customer-facing price directly and it wins
    // outright. They remain in control of what the customer is charged.
    case 'manual': return round2(Number.isFinite(markupValue) ? markupValue : landedCost);
  }
}

/**
 * Turn a chosen search result into an estimate line plus its frozen snapshot.
 *
 * Pure: it takes a result and returns a line. It does not save, and it does
 * not decide — the technician has already chosen the part, the quantity and
 * the markup before this is called.
 */
export function buildEstimateLineFromPart(input: BuildLineInput): PartsSourcedLine {
  const { part, qty, markupType, markupValue } = input;

  const landed = part.landedCost ?? part.itemPrice ?? 0;
  const sellUnitPrice = sellPriceFor(landed, markupType, markupValue);

  // The part number goes in `note`, which is the field the estimate already
  // prints beside a line — rather than being buried in a description a
  // technician would have to read to find.
  const note = part.manufacturerPartNumber ?? part.providerListingId ?? '';

  const description = [part.brand, part.title].filter(Boolean).join(' ').trim() || part.title;

  return {
    note,
    description,
    qty,
    // `rate` is the canonical customer-facing unit price. calculateEstimateTotals
    // reads this and nothing else from the snapshot.
    rate: sellUnitPrice,
    // `cost` and `markup` are the estimate's OWN existing fields, so a
    // marketplace line behaves identically to a hand-typed one in the form.
    cost: landed,
    markup: markupType === 'percentage' ? markupValue : undefined,
    currency: input.currency,
    partsSource: {
      sourceProvider: part.provider,
      sourceListingId: part.providerListingId,
      sourceCheckedAt: part.sourceCheckedAt,
      sourceItemPrice: part.itemPrice ?? null,
      sourceShippingCost: part.shippingCost ?? null,
      sourceTax: part.estimatedTax ?? null,
      sourceImportDuty: part.estimatedImportDuty ?? null,
      sourceCurrency: part.currency,
      landedCost: part.landedCost ?? null,
      landedCostCompleteness: part.landedCostCompleteness ?? 'unknown',
      brand: part.brand,
      manufacturerPartNumber: part.manufacturerPartNumber,
      oemNumbers: part.oemNumbers,
      imageUrl: part.imageUrl,
      productUrl: part.productUrl,
      affiliateUrl: part.affiliateUrl,
      fitmentStatus: part.fitmentStatus,
      fitmentReason: part.fitmentReason,
      markupType,
      markupValue,
      sellUnitPrice,
    },
  };
}

export interface PriceComparison {
  changed: boolean;
  previousLandedCost: number | null;
  currentLandedCost: number | null;
  difference: number | null;
  previousCheckedAt: string;
  currentCheckedAt: string;
}

/**
 * Compare a frozen snapshot with a fresh look-up. RETURNS ONLY.
 *
 * There is no variant of this that writes. Applying a new price is a separate
 * call the technician makes after seeing this, which is the whole point: a
 * refresh that silently updated the line would reintroduce exactly the
 * behaviour the snapshot exists to prevent.
 */
export function compareToSnapshot(
  snapshot: PartsSourceSnapshot,
  fresh: NormalizedPartResult,
): PriceComparison {
  const previous = snapshot.landedCost;
  const current = fresh.landedCost ?? null;
  const difference =
    previous !== null && current !== null ? round2(current - previous) : null;

  return {
    changed: difference !== null ? difference !== 0 : previous !== current,
    previousLandedCost: previous,
    currentLandedCost: current,
    difference,
    previousCheckedAt: snapshot.sourceCheckedAt,
    currentCheckedAt: fresh.sourceCheckedAt,
  };
}

/**
 * The customer-facing total for a line — the canonical model, restated here
 * only so a test can prove the snapshot never enters it.
 */
export function lineTotal(line: PartsSourcedLine): number {
  return round2(line.qty * line.rate);
}
