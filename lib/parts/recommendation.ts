/**
 * Ranking parts. Deterministic, explainable, and blind to commission.
 *
 * ## Why no AI here
 *
 * A language model is good at sounding certain about fitment and bad at being
 * certain about it. This module therefore takes only fields a provider stated,
 * and every reason it prints is derived from one of those fields — so the
 * explanation cannot drift from the score, and neither can be hallucinated.
 * `scorePart` is a pure function of its input; the same result always scores
 * the same.
 *
 * ## Affiliate neutrality
 *
 * `affiliateUrl` is not read by this file, and a test asserts that scoring two
 * otherwise identical results — one with an affiliate link, one without —
 * returns byte-identical scores. Neutrality enforced by a test rather than by
 * a comment, because a comment does not fail CI.
 *
 * ## Incompatible cannot win
 *
 * A part the provider rejected is never recommended, at any price. It is
 * scored 0 and excluded from labelling entirely rather than ranked last, so no
 * sort order and no future weighting change can float it to the top.
 */
import { FITMENT_RANK } from './fitment';
import type { NormalizedPartResult } from './types';

export type RecommendationLabel =
  | 'best_overall'
  | 'best_value'
  | 'lowest_price'
  | 'fastest_delivery'
  | 'premium';

export interface Recommendation {
  score: number;
  label: RecommendationLabel | null;
  reasons: string[];
}

export interface ScoredPart {
  part: NormalizedPartResult;
  recommendation: Recommendation;
}

/**
 * Weights, stated once and out loud.
 *
 * Fitment dominates deliberately: a verified part that costs more is the right
 * answer, because the cost of the wrong part is a return, a second job, and a
 * customer who was told a date. Price is the second input, never the first.
 */
const WEIGHTS = {
  fitment: 40,
  price: 25,
  quality: 12,
  delivery: 12,
  seller: 8,
  warranty: 3,
} as const;

export const MAX_SCORE =
  WEIGHTS.fitment + WEIGHTS.price + WEIGHTS.quality +
  WEIGHTS.delivery + WEIGHTS.seller + WEIGHTS.warranty;

/**
 * Brands a workshop treats as first-tier.
 *
 * A short, explicit list rather than a judgement: it is inspected in review,
 * it is the same for every shop, and an unlisted brand simply scores neutral
 * instead of being penalised for being unknown.
 */
const QUALITY_BRANDS = [
  'akebono', 'bosch', 'brembo', 'denso', 'aisin', 'ngk', 'nissens', 'sachs',
  'gates', 'febi', 'lemforder', 'mahle', 'mann', 'moog', 'kyb', 'exedy',
  'toyota', 'honda', 'nissan', 'mazda', 'mitsubishi', 'subaru', 'hyundai',
  'kia', 'ford', 'gm', 'mopar', 'bmw', 'mercedes-benz', 'volkswagen', 'audi',
];

function fitmentScore(p: NormalizedPartResult): number {
  switch (p.fitmentStatus) {
    case 'verified': return WEIGHTS.fitment;
    case 'likely': return WEIGHTS.fitment * 0.6;
    case 'unverified': return WEIGHTS.fitment * 0.25;
    case 'incompatible': return 0;
  }
}

/**
 * Price scored against the cheapest LANDED cost in the same set, not the
 * cheapest item price. A part with no landed cost scores neutral rather than
 * best — an unknown price is not a bargain.
 */
function priceScore(p: NormalizedPartResult, cheapestLanded: number | null): number {
  if (p.landedCost === undefined || cheapestLanded === null || cheapestLanded <= 0) {
    return WEIGHTS.price * 0.5;
  }
  const ratio = cheapestLanded / p.landedCost;
  return WEIGHTS.price * Math.max(0, Math.min(1, ratio));
}

function qualityScore(p: NormalizedPartResult): number {
  const brand = (p.brand ?? '').toLowerCase();
  const known = brand && QUALITY_BRANDS.some(b => brand.includes(b));
  let score = known ? WEIGHTS.quality : WEIGHTS.quality * 0.5;

  // A used or for-parts listing is not comparable to a new one.
  const condition = (p.condition ?? '').toLowerCase();
  if (condition.includes('for parts') || condition.includes('not working')) return 0;
  if (condition.includes('used')) score *= 0.5;
  else if (condition.includes('refurb') || condition.includes('remanufact')) score *= 0.8;

  return score;
}

function deliveryScore(p: NormalizedPartResult, now: Date): number {
  if (!p.estimatedDeliveryEnd) return WEIGHTS.delivery * 0.5;
  const end = Date.parse(p.estimatedDeliveryEnd);
  if (!Number.isFinite(end)) return WEIGHTS.delivery * 0.5;
  const days = (end - now.getTime()) / 86_400_000;
  if (days <= 0) return WEIGHTS.delivery * 0.5; // stale or already past
  if (days <= 3) return WEIGHTS.delivery;
  if (days <= 7) return WEIGHTS.delivery * 0.75;
  if (days <= 14) return WEIGHTS.delivery * 0.45;
  return WEIGHTS.delivery * 0.2;
}

function sellerScore(p: NormalizedPartResult): number {
  if (p.sellerRating === undefined) return WEIGHTS.seller * 0.5;
  // Ratings are normalised to 0–1 upstream. Below 0.9 on a marketplace is
  // genuinely poor, so the useful range is compressed into the top decile.
  const r = Math.max(0, Math.min(1, p.sellerRating));
  const scaled = Math.max(0, (r - 0.9) / 0.1);
  return WEIGHTS.seller * Math.min(1, scaled);
}

function warrantyScore(p: NormalizedPartResult): number {
  return p.warranty ? WEIGHTS.warranty : 0;
}

function buildReasons(p: NormalizedPartResult, cheapestLanded: number | null): string[] {
  const reasons: string[] = [];

  if (p.fitmentStatus === 'verified') reasons.push('Verified fitment for this vehicle');
  else if (p.fitmentStatus === 'likely') reasons.push('Part number matches, fitment not confirmed');
  else if (p.fitmentStatus === 'unverified') reasons.push('Fitment not confirmed by the seller');

  const brand = (p.brand ?? '').toLowerCase();
  if (brand && QUALITY_BRANDS.some(b => brand.includes(b))) {
    reasons.push(`${p.brand} is a recognised manufacturer`);
  }

  if (p.landedCost !== undefined && cheapestLanded !== null) {
    if (p.landedCost === cheapestLanded) reasons.push('Lowest landed cost of the results');
    else if (p.landedCost <= cheapestLanded * 1.1) reasons.push('Competitive landed cost');
  }

  if (p.landedCostCompleteness === 'partial') {
    // Stated as a reason, not hidden in a tooltip: the number is incomplete
    // and the person quoting from it should know before they quote.
    reasons.push('Landed cost excludes tax and import duty, which are not published');
  }

  if (p.sellerRating !== undefined && p.sellerRating >= 0.98) reasons.push('Strong seller history');
  if (p.warranty) reasons.push(`Warranty: ${p.warranty}`);

  const condition = (p.condition ?? '').toLowerCase();
  if (condition.includes('used')) reasons.push('Used part');

  return reasons;
}

export function scorePart(
  p: NormalizedPartResult,
  ctx: { cheapestLanded: number | null; now?: Date },
): Recommendation {
  // Refused outright. Not ranked low — excluded, so no weighting change can
  // ever float a part the provider said does not fit.
  if (p.fitmentStatus === 'incompatible') {
    return {
      score: 0,
      label: null,
      reasons: [p.fitmentReason ?? 'The seller reports this part does not fit this vehicle'],
    };
  }

  const now = ctx.now ?? new Date();
  const raw =
    fitmentScore(p) +
    priceScore(p, ctx.cheapestLanded) +
    qualityScore(p) +
    deliveryScore(p, now) +
    sellerScore(p) +
    warrantyScore(p);

  return {
    score: Math.round((raw / MAX_SCORE) * 100),
    label: null, // assigned across the set, below
    reasons: buildReasons(p, ctx.cheapestLanded),
  };
}

function cheapestLandedOf(parts: NormalizedPartResult[]): number | null {
  const costs = parts
    .filter(p => p.fitmentStatus !== 'incompatible')
    .map(p => p.landedCost)
    .filter((c): c is number => typeof c === 'number' && c > 0);
  return costs.length ? Math.min(...costs) : null;
}

/**
 * Score a whole result set and hand out labels.
 *
 * Labels are assigned across the set because they are comparative claims —
 * "lowest price" is meaningless for one result in isolation. Each label is
 * used at most once, and only a recommendable part can receive one.
 */
/**
 * Whether a catalogue row is filed under a different marque than the vehicle.
 *
 * Exact on punctuation and case only. Never a similarity score — Toyota and
 * Lexus are the same company and entirely different parts catalogues, and
 * this function decides whether a badge appears.
 */
export function marqueContradicts(part: NormalizedPartResult, vehicleMake?: string): boolean {
  if (!part.vehicleManufacturer || !vehicleMake) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return norm(part.vehicleManufacturer) !== norm(vehicleMake);
}

export function rankParts(
  parts: NormalizedPartResult[],
  opts: { now?: Date; vehicleMake?: string } = {},
): ScoredPart[] {
  const cheapestLanded = cheapestLandedOf(parts);
  const scored: ScoredPart[] = parts.map(part => ({
    part,
    recommendation: scorePart(part, { cheapestLanded, now: opts.now }),
  }));

  /**
   * Who may carry a badge.
   *
   * Two exclusions, and they are exclusions rather than penalties for the
   * same reason: no weighting change can float them back to the top.
   *
   * `incompatible` — the provider said it does not fit.
   *
   * A CONTRADICTING MARQUE — the row is filed under Lexus and the estimate is
   * a Mercedes. Fitment already reads UNVERIFIED for these, which is correct
   * and safe, but "RECOMMENDED" is a stronger word than a score: on a list of
   * 277 rows a technician reads the badge long before they read the marque.
   * The score is left alone — score and fitment are deliberately separate —
   * but the endorsement is withheld.
   */
  const eligible = scored.filter(s =>
    s.part.fitmentStatus !== 'incompatible'
    && !marqueContradicts(s.part, opts.vehicleMake));

  // Say why, on the row itself, rather than leaving a silent absence.
  for (const s of scored) {
    if (marqueContradicts(s.part, opts.vehicleMake)) {
      s.recommendation.reasons.unshift(
        `Filed under ${s.part.vehicleManufacturer}, not ${opts.vehicleMake} — not recommended for this vehicle.`,
      );
    }
  }

  if (!eligible.length) return scored;

  const taken = new Set<ScoredPart>();
  const give = (s: ScoredPart | undefined, label: RecommendationLabel) => {
    if (!s || taken.has(s)) return;
    s.recommendation.label = label;
    taken.add(s);
  };

  // Stable ordering: ties break on fitment, then landed cost, then title, so
  // the same input always produces the same badges.
  const byScore = [...eligible].sort((a, b) =>
    b.recommendation.score - a.recommendation.score ||
    FITMENT_RANK[b.part.fitmentStatus] - FITMENT_RANK[a.part.fitmentStatus] ||
    (a.part.landedCost ?? Infinity) - (b.part.landedCost ?? Infinity) ||
    a.part.title.localeCompare(b.part.title));
  give(byScore[0], 'best_overall');

  const withLanded = eligible.filter(s => typeof s.part.landedCost === 'number');
  const byLanded = [...withLanded].sort((a, b) =>
    (a.part.landedCost ?? 0) - (b.part.landedCost ?? 0) || a.part.title.localeCompare(b.part.title));
  give(byLanded[0], 'lowest_price');

  // Best value = the best score among the cheaper half. Distinct from
  // lowest_price, which ignores whether the part is any good.
  if (withLanded.length > 2) {
    const half = byLanded.slice(0, Math.ceil(byLanded.length / 2));
    const bestOfCheap = [...half].sort((a, b) =>
      b.recommendation.score - a.recommendation.score ||
      a.part.title.localeCompare(b.part.title))[0];
    give(bestOfCheap, 'best_value');
  }

  const withDelivery = eligible.filter(s => {
    const t = Date.parse(s.part.estimatedDeliveryEnd ?? '');
    return Number.isFinite(t);
  });
  const byDelivery = [...withDelivery].sort((a, b) =>
    Date.parse(a.part.estimatedDeliveryEnd!) - Date.parse(b.part.estimatedDeliveryEnd!) ||
    a.part.title.localeCompare(b.part.title));
  give(byDelivery[0], 'fastest_delivery');

  const priciest = [...withLanded].sort((a, b) =>
    (b.part.landedCost ?? 0) - (a.part.landedCost ?? 0) || a.part.title.localeCompare(b.part.title))[0];
  if (priciest && priciest.part.fitmentStatus === 'verified') give(priciest, 'premium');

  return scored;
}

export const LABEL_TEXT: Record<RecommendationLabel, string> = {
  best_overall: 'RECOMMENDED',
  best_value: 'BEST VALUE',
  lowest_price: 'LOWEST PRICE',
  fastest_delivery: 'FASTEST DELIVERY',
  premium: 'PREMIUM',
};
