/**
 * Landed cost, and a ranking that cannot be bought.
 *
 * Two rules are load-bearing here and both are asserted rather than asserted
 * in prose:
 *
 *   1. An unknown cost is never treated as zero. A total that looks
 *      authoritative and is wrong LOW is the worst kind for a shop to quote.
 *   2. Affiliate revenue cannot influence a score. Enforced by a test because
 *      a comment does not fail CI.
 */
import { calculateLandedCost, sellPriceFromMarkup, markupFromSellPrice, round2 } from '../landedCost';
import { scorePart, rankParts, MAX_SCORE } from '../recommendation';
import type { NormalizedPartResult } from '../types';

const NOW = new Date('2026-08-23T00:00:00.000Z');

function part(over: Partial<NormalizedPartResult> = {}): NormalizedPartResult {
  return {
    provider: 'ebay',
    title: 'Brake Pad Set',
    currency: 'USD',
    itemPrice: 64.95,
    shippingCost: 8,
    estimatedTax: null,
    estimatedImportDuty: null,
    landedCost: 72.95,
    landedCostCompleteness: 'partial',
    fitmentStatus: 'verified',
    sourceCheckedAt: NOW.toISOString(),
    ...over,
  };
}

describe('landed cost', () => {
  it('adds item and shipping', () => {
    const r = calculateLandedCost({ itemPrice: 64.95, shippingCost: 8 });
    expect(r.landedCost).toBe(72.95);
  });

  it('adds tax and duty when they are known', () => {
    const r = calculateLandedCost({
      itemPrice: 100, shippingCost: 10, estimatedTax: 7, estimatedImportDuty: 5,
    });
    expect(r.landedCost).toBe(122);
    expect(r.completeness).toBe('complete');
    expect(r.missing).toEqual([]);
  });

  it('reports partial when tax is unknown, and does NOT invent it', () => {
    const r = calculateLandedCost({ itemPrice: 100, shippingCost: 10 });
    expect(r.estimatedTax).toBeNull();
    expect(r.landedCost).toBe(110);
    expect(r.completeness).toBe('partial');
    expect(r.missing).toContain('estimatedTax');
    expect(r.missing).toContain('estimatedImportDuty');
  });

  it('distinguishes free shipping from unknown shipping', () => {
    // Zero is a fact; undefined is an absence. Collapsing them would report an
    // incomplete total as complete.
    const free = calculateLandedCost({ itemPrice: 50, shippingCost: 0 });
    const unknown = calculateLandedCost({ itemPrice: 50 });
    expect(free.landedCost).toBe(50);
    expect(unknown.landedCost).toBe(50);
    expect(free.missing).not.toContain('shippingCost');
    expect(unknown.missing).toContain('shippingCost');
  });

  it('refuses to total anything without an item price', () => {
    const r = calculateLandedCost({ shippingCost: 8 });
    expect(r.landedCost).toBeNull();
    expect(r.completeness).toBe('unknown');
  });

  it('ignores NaN and Infinity rather than propagating them', () => {
    const r = calculateLandedCost({ itemPrice: 10, shippingCost: NaN });
    expect(r.shippingCost).toBeNull();
    expect(r.landedCost).toBe(10);
  });

  it('rounds once, at the end', () => {
    // Rounding each component then summing drifts. 0.1 + 0.2 is the classic.
    const r = calculateLandedCost({ itemPrice: 0.1, shippingCost: 0.2 });
    expect(r.landedCost).toBe(0.3);
  });
});

describe('markup uses the same rule as the estimate form', () => {
  it('sell price = landed × (1 + pct/100)', () => {
    expect(sellPriceFromMarkup(72.95, 35)).toBe(98.48);
    expect(sellPriceFromMarkup(100, 0)).toBe(100);
  });

  it('derives the markup implied by a typed sell price', () => {
    expect(markupFromSellPrice(100, 135)).toBe(35);
    expect(markupFromSellPrice(0, 50)).toBeNull();
  });

  it('rounds to two places, matching the form', () => {
    expect(round2(1.005)).toBeCloseTo(1, 2);
    expect(round2(72.949)).toBe(72.95);
  });
});

describe('ranking', () => {
  it('a verified part outranks a cheaper unverified one', () => {
    // The rule the whole feature turns on. The wrong part is not a saving.
    const verified = part({ landedCost: 90, fitmentStatus: 'verified', title: 'A' });
    const cheap = part({ landedCost: 50, fitmentStatus: 'unverified', title: 'B' });
    const ranked = rankParts([cheap, verified], { now: NOW });
    const best = ranked.find(r => r.recommendation.label === 'best_overall');
    expect(best?.part.title).toBe('A');
  });

  it('an incompatible part scores zero and can never be recommended', () => {
    const bad = part({ landedCost: 1, fitmentStatus: 'incompatible', title: 'NoFit' });
    const ok = part({ landedCost: 500, fitmentStatus: 'unverified', title: 'Fits' });
    const ranked = rankParts([bad, ok], { now: NOW });
    const badRow = ranked.find(r => r.part.title === 'NoFit')!;
    expect(badRow.recommendation.score).toBe(0);
    expect(badRow.recommendation.label).toBeNull();
    // Not even when it is the only cheap option.
    expect(ranked.every(r => r.recommendation.label !== 'best_overall' || r.part.title !== 'NoFit'))
      .toBe(true);
  });

  it('affiliate presence does not change the score by a single point', () => {
    // Neutrality, enforced. If someone weights commission later, this fails.
    const plain = part({ title: 'X' });
    const affiliate = part({ title: 'X', affiliateUrl: 'https://ebay.com/aff?campid=999' });
    const a = scorePart(plain, { cheapestLanded: 72.95, now: NOW });
    const b = scorePart(affiliate, { cheapestLanded: 72.95, now: NOW });
    expect(b.score).toBe(a.score);
    expect(b.reasons).toEqual(a.reasons);
  });

  it('lowest item price is not automatically lowest landed cost', () => {
    // $61 + $18 loses to $67 + $0. Ranking on item price picks the wrong one.
    const cheapItem = part({ title: 'CheapItem', itemPrice: 61, shippingCost: 18, landedCost: 79 });
    const dearItem = part({ title: 'DearItem', itemPrice: 67, shippingCost: 0, landedCost: 67 });
    const ranked = rankParts([cheapItem, dearItem], { now: NOW });

    const cheap = ranked.find(r => r.part.title === 'CheapItem')!;
    const dear = ranked.find(r => r.part.title === 'DearItem')!;
    // The dearer ITEM wins because its LANDED cost is lower.
    expect(dear.recommendation.score).toBeGreaterThan(cheap.recommendation.score);
    expect(dear.recommendation.reasons).toContain('Lowest landed cost of the results');
    expect(cheap.recommendation.reasons).not.toContain('Lowest landed cost of the results');
  });

  it('a part with no landed cost is not treated as free', () => {
    const unknown = part({ title: 'Unknown', landedCost: undefined, itemPrice: undefined });
    const known = part({ title: 'Known', landedCost: 72.95 });
    const ranked = rankParts([unknown, known], { now: NOW });

    // The known price is the cheapest of the set; an absent one is not a
    // bargain and never claims to be.
    expect(ranked.find(r => r.part.title === 'Known')!.recommendation.reasons)
      .toContain('Lowest landed cost of the results');
    expect(ranked.find(r => r.part.title === 'Unknown')!.recommendation.reasons)
      .not.toContain('Lowest landed cost of the results');
  });

  it('a badge is only claimed once, so no card makes two comparative claims', () => {
    // When the best part is also the cheapest it keeps ONE badge rather than
    // both, and "lowest price" is not handed to the runner-up — that would be
    // a false claim on a card a technician is comparing prices from.
    const best = part({ title: 'Best', landedCost: 50, fitmentStatus: 'verified' });
    const other = part({ title: 'Other', landedCost: 90, fitmentStatus: 'unverified' });
    const ranked = rankParts([best, other], { now: NOW });

    expect(ranked.find(r => r.part.title === 'Best')!.recommendation.label).toBe('best_overall');
    expect(ranked.find(r => r.part.title === 'Other')!.recommendation.label).not.toBe('lowest_price');
  });

  it('scores are deterministic', () => {
    const p = part();
    const a = scorePart(p, { cheapestLanded: 72.95, now: NOW });
    const b = scorePart(p, { cheapestLanded: 72.95, now: NOW });
    expect(a).toEqual(b);
  });

  it('never exceeds 100', () => {
    const perfect = part({
      fitmentStatus: 'verified', brand: 'Akebono', condition: 'New',
      landedCost: 10, sellerRating: 1, warranty: '2 years',
      estimatedDeliveryEnd: new Date(NOW.getTime() + 86_400_000).toISOString(),
    });
    const s = scorePart(perfect, { cheapestLanded: 10, now: NOW });
    expect(s.score).toBeLessThanOrEqual(100);
    expect(MAX_SCORE).toBeGreaterThan(0);
  });

  it('a for-parts listing scores no quality at all', () => {
    const broken = part({ condition: 'For parts or not working', title: 'Broken' });
    const good = part({ condition: 'New', title: 'Good' });
    const b = scorePart(broken, { cheapestLanded: 72.95, now: NOW });
    const g = scorePart(good, { cheapestLanded: 72.95, now: NOW });
    expect(b.score).toBeLessThan(g.score);
  });

  it('explains itself from real fields only', () => {
    const s = scorePart(part({ brand: 'Akebono', sellerRating: 0.99 }), {
      cheapestLanded: 72.95, now: NOW,
    });
    expect(s.reasons).toContain('Verified fitment for this vehicle');
    expect(s.reasons.some(r => r.includes('Akebono'))).toBe(true);
    // The incomplete landed cost is disclosed, not buried.
    expect(s.reasons.some(r => r.includes('tax and import duty'))).toBe(true);
  });

  it('states why an incompatible part was refused', () => {
    const s = scorePart(
      part({ fitmentStatus: 'incompatible', fitmentReason: 'eBay reports this does not fit.' }),
      { cheapestLanded: 10, now: NOW },
    );
    expect(s.reasons[0]).toContain('does not fit');
  });

  it('handles an empty set without throwing', () => {
    expect(rankParts([], { now: NOW })).toEqual([]);
  });
});
