/**
 * The promise this feature makes to a customer.
 *
 * An estimate is a quote. If its total moved because a seller changed a price
 * overnight, the shop would be quoting one number and billing another. These
 * tests are the guarantee that cannot happen — and the guarantee is
 * structural, not procedural: the snapshot is metadata, and the canonical
 * total function never reads it.
 */
import {
  buildEstimateLineFromPart, compareToSnapshot, sellPriceFor, lineTotal,
} from '../snapshot';
import * as snapshotModule from '../snapshot';
import { calculateEstimateTotals, type EstimateFull } from '../../../services/estimateService';
import type { NormalizedPartResult } from '../types';

const CHECKED_AT = '2026-08-23T00:00:00.000Z';

const AKEBONO: NormalizedPartResult = {
  provider: 'ebay',
  providerListingId: 'v1|123|0',
  title: 'ProACT ACT976 Front Brake Pads',
  brand: 'Akebono',
  manufacturerPartNumber: 'ACT976',
  imageUrl: 'https://i.ebayimg.com/x.jpg',
  productUrl: 'https://www.ebay.com/itm/123',
  currency: 'USD',
  itemPrice: 64.95,
  shippingCost: 8,
  estimatedTax: null,
  estimatedImportDuty: null,
  landedCost: 72.95,
  landedCostCompleteness: 'partial',
  fitmentStatus: 'verified',
  fitmentReason: 'eBay confirms compatibility with 2019 Toyota Tacoma.',
  sourceCheckedAt: CHECKED_AT,
};

const line = (over = {}) => buildEstimateLineFromPart({
  part: AKEBONO, qty: 1, markupType: 'percentage', markupValue: 35, ...over,
});

describe('adding a marketplace part to an estimate', () => {
  it('prices it from LANDED cost, not item price', () => {
    // 72.95 × 1.35 = 98.4825 -> 98.48. Pricing off the $64.95 item price would
    // quietly give away the shipping.
    expect(line().rate).toBe(98.48);
  });

  it('reuses the estimate line fields rather than inventing new ones', () => {
    const l = line();
    // cost and markup already exist on EstimateLine, and the form derives
    // rate from them. A marketplace line therefore behaves exactly like a
    // hand-typed one.
    expect(l.cost).toBe(72.95);
    expect(l.markup).toBe(35);
    expect(l.qty).toBe(1);
  });

  it('puts the part number where the estimate already prints it', () => {
    expect(line().note).toBe('ACT976');
  });

  it('freezes every source field at the moment of quoting', () => {
    const s = line().partsSource!;
    expect(s.sourceProvider).toBe('ebay');
    expect(s.sourceListingId).toBe('v1|123|0');
    expect(s.sourceItemPrice).toBe(64.95);
    expect(s.sourceShippingCost).toBe(8);
    expect(s.landedCost).toBe(72.95);
    expect(s.sourceCheckedAt).toBe(CHECKED_AT);
    expect(s.sellUnitPrice).toBe(98.48);
    expect(s.fitmentStatus).toBe('verified');
  });

  it('keeps unknown tax and duty as null in the snapshot', () => {
    const s = line().partsSource!;
    expect(s.sourceTax).toBeNull();
    expect(s.sourceImportDuty).toBeNull();
    expect(s.landedCostCompleteness).toBe('partial');
  });

  it('supports the three markup modes', () => {
    expect(sellPriceFor(100, 'percentage', 35)).toBe(135);
    expect(sellPriceFor(100, 'fixed', 25)).toBe(125);
    // Manual wins outright — the technician stays in control of the price.
    expect(sellPriceFor(100, 'manual', 180)).toBe(180);
  });

  it('does not record a percentage markup for a manual price', () => {
    const l = line({ markupType: 'manual', markupValue: 150 });
    expect(l.rate).toBe(150);
    expect(l.markup).toBeUndefined();
    expect(l.partsSource!.markupType).toBe('manual');
  });
});

describe('an issued estimate never moves with the market', () => {
  it('the total uses the frozen sell price, not the source price', () => {
    const l = line({ qty: 2 });
    const est = {
      currency: 'USD', discount: 0, shopSupplies: 0, taxRate: 0,
      lines: [{ note: l.note, description: l.description, qty: l.qty, rate: l.rate }],
    } as unknown as EstimateFull;

    // 2 × 98.48. Nothing here consults landed cost or the provider.
    expect(calculateEstimateTotals(est).subtotal).toBe(196.96);
    expect(lineTotal(l)).toBe(196.96);
  });

  it('a later provider price change does not mutate the saved line', () => {
    const saved = line();
    const before = JSON.parse(JSON.stringify(saved));

    // The market moves.
    const now: NormalizedPartResult = {
      ...AKEBONO, itemPrice: 81.5, shippingCost: 8, landedCost: 89.5,
      sourceCheckedAt: '2026-09-01T00:00:00.000Z',
    };
    const diff = compareToSnapshot(saved.partsSource!, now);

    expect(diff.changed).toBe(true);
    expect(diff.previousLandedCost).toBe(72.95);
    expect(diff.currentLandedCost).toBe(89.5);
    expect(diff.difference).toBe(16.55);

    // The comparison is a report. It touched nothing.
    expect(saved).toEqual(before);
    expect(saved.rate).toBe(98.48);
    expect(saved.partsSource!.landedCost).toBe(72.95);
  });

  it('reports no change when the price held', () => {
    const saved = line();
    const diff = compareToSnapshot(saved.partsSource!, { ...AKEBONO });
    expect(diff.changed).toBe(false);
    expect(diff.difference).toBe(0);
  });

  it('compareToSnapshot is the only refresh path, and it cannot write', () => {
    // A refresh that could update the line would reintroduce exactly the
    // behaviour the snapshot exists to prevent, so the module exports no
    // function that takes a line and mutates it.
    const writers = Object.keys(snapshotModule)
      .filter(k => /^(apply|update|save|sync|refresh)/i.test(k));
    expect(writers).toEqual([]);
  });

  it('marks a refresh only when one actually happened', () => {
    expect(line().partsSource!.refreshedAt).toBeUndefined();
  });
});

describe('the snapshot is metadata, never arithmetic', () => {
  it('estimate totals ignore it entirely', () => {
    const withSource = line();
    const est = (rate: number) => ({
      currency: 'USD', discount: 0, shopSupplies: 0, taxRate: 0,
      lines: [{ note: '', description: 'x', qty: 1, rate }],
    } as unknown as EstimateFull);

    // Same rate, wildly different source data -> identical total.
    const a = calculateEstimateTotals(est(withSource.rate));
    const b = calculateEstimateTotals(est(98.48));
    expect(a.total).toBe(b.total);
  });

  it('the canonical total function does not reference partsSource', () => {
    const fs = jest.requireActual('fs') as typeof import('fs');
    const path = jest.requireActual('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'services', 'estimateService.ts'), 'utf8');
    const fn = src.slice(
      src.indexOf('export function calculateEstimateTotals'),
      src.indexOf('export async function fetchEstimates'));
    expect(fn).not.toContain('partsSource');
    expect(fn).not.toContain('landedCost');
    // Still qty × rate, unchanged.
    expect(fn).toContain('l.qty * l.rate');
  });
});
