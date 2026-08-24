/**
 * What a part actually costs to get onto the bench.
 *
 * The cheapest item is routinely not the cheapest part. A $61 rotor with $18
 * shipping loses to a $67 one shipped free, and comparing item prices — which
 * is what every marketplace UI shows first — picks the wrong one. So nothing
 * in this feature ranks on item price alone.
 *
 * ## Unknown is not zero
 *
 * Import duty into Laos is real and this code does not know it. Treating an
 * unknown as 0 produces a total that looks authoritative and is wrong low,
 * which is the worst direction for a number a shop quotes from. Unknown parts
 * stay `null` and the total is labelled `partial` so the UI can say so.
 *
 * ## Money
 *
 * The project has no Decimal or minor-units helper — `calculateEstimateTotals`
 * multiplies plain numbers and the estimate form rounds with `.toFixed(2)`. So
 * this matches that convention rather than introducing a second money model
 * that would disagree with the canonical totals. Rounding happens ONCE, at the
 * end, because rounding each component and then summing drifts.
 */

export interface LandedCostParts {
  itemPrice?: number | null;
  shippingCost?: number | null;
  estimatedTax?: number | null;
  estimatedImportDuty?: number | null;
}

export interface LandedCostResult {
  itemPrice: number | null;
  shippingCost: number | null;
  estimatedTax: number | null;
  estimatedImportDuty: number | null;
  landedCost: number | null;
  completeness: 'complete' | 'partial' | 'unknown';
  /** Which components were absent. Shown to the technician, not swallowed. */
  missing: Array<'itemPrice' | 'shippingCost' | 'estimatedTax' | 'estimatedImportDuty'>;
}

/** Two decimals, matching the estimate form's own rounding. */
export function round2(n: number): number {
  // Number() strips the trailing zeros toFixed leaves behind, so 72.9 does not
  // become the string "72.90" and then a different number downstream.
  return Number(n.toFixed(2));
}

function clean(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function calculateLandedCost(parts: LandedCostParts): LandedCostResult {
  const itemPrice = clean(parts.itemPrice);
  const shippingCost = clean(parts.shippingCost);
  const estimatedTax = clean(parts.estimatedTax);
  const estimatedImportDuty = clean(parts.estimatedImportDuty);

  const missing: LandedCostResult['missing'] = [];
  if (itemPrice === null) missing.push('itemPrice');
  if (shippingCost === null) missing.push('shippingCost');
  if (estimatedTax === null) missing.push('estimatedTax');
  if (estimatedImportDuty === null) missing.push('estimatedImportDuty');

  // With no item price there is no total worth showing. Summing shipping alone
  // would produce a confident-looking number for a part whose price we do not
  // have, which is exactly the failure this module exists to avoid.
  if (itemPrice === null) {
    return {
      itemPrice, shippingCost, estimatedTax, estimatedImportDuty,
      landedCost: null, completeness: 'unknown', missing,
    };
  }

  const sum = itemPrice + (shippingCost ?? 0) + (estimatedTax ?? 0) + (estimatedImportDuty ?? 0);

  return {
    itemPrice,
    shippingCost,
    estimatedTax,
    estimatedImportDuty,
    landedCost: round2(sum),
    completeness: missing.length === 0 ? 'complete' : 'partial',
    missing,
  };
}

/**
 * The sell price for an estimate line.
 *
 * Mirrors what the estimate form already does — `rate = cost × (1 + pct/100)`
 * — so a part added through Parts Intelligence and a part typed by hand price
 * identically. Duplicating that rule with a different rounding point is how
 * two lines with the same cost and markup end up a cent apart.
 *
 * There is deliberately no default markup here. Inventing one silently prices
 * a customer's job on a number nobody chose; the UI asks instead.
 */
export function sellPriceFromMarkup(landedCost: number, markupPercent: number): number {
  const pct = Number.isFinite(markupPercent) ? markupPercent : 0;
  return round2(landedCost * (1 + pct / 100));
}

/** The markup implied by a hand-typed sell price, for display only. */
export function markupFromSellPrice(landedCost: number, sellPrice: number): number | null {
  if (!Number.isFinite(landedCost) || landedCost <= 0) return null;
  if (!Number.isFinite(sellPrice)) return null;
  return round2((sellPrice / landedCost - 1) * 100);
}
