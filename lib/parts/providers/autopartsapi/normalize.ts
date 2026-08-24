/**
 * AutoPartsAPI article → NormalizedPartResult.
 *
 * A catalogue is not a marketplace: it publishes what a part IS, not what it
 * costs today. So every field here is identity — brand, article number, OEM
 * cross-references — and there is deliberately no price, no shipping and no
 * landed cost. Inventing a price for a catalogue row would put a number on an
 * estimate that no seller has ever quoted.
 *
 * ## Fitment
 *
 * A catalogue match produces `likely` AT BEST, and only when a part number
 * genuinely lines up. It can never produce `verified`: a cross-reference says
 * "this article corresponds to that OEM number", which is not the same
 * statement as "this fits the 2019 Tacoma in bay three". Only a provider
 * stating vehicle compatibility earns `verified`, and this one is not
 * currently asked that question.
 */
import { safeText, safeHttpsUrl } from '../../normalize';
import type { NormalizedPartResult, PartsSearchInput } from '../../types';
import type { AutoPartsArticle } from './types';

function collectOem(a: AutoPartsArticle): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    const s = safeText(v, 60);
    if (s) out.push(s.toUpperCase());
  };
  if (Array.isArray(a.oemNumbers)) a.oemNumbers.forEach(push);
  if (Array.isArray(a.oem)) a.oem.forEach(push);
  else if (typeof a.oem === 'string') push(a.oem);
  return [...new Set(out)].slice(0, 25);
}

function firstImage(a: AutoPartsArticle): string | undefined {
  return safeHttpsUrl(a.imageUrl)
    ?? safeHttpsUrl(a.image)
    ?? safeHttpsUrl(a.images?.[0]?.url);
}

/** Normalised MPN/OEM comparison — case and separators do not carry meaning. */
export function normalizePartNumber(raw: unknown): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function normalizeAutoPartsArticle(
  article: AutoPartsArticle,
  input: PartsSearchInput,
  opts: { checkedAt: string },
): NormalizedPartResult | null {
  const title = safeText(article.name ?? article.title, 200);
  if (!title) return null;

  const mpn = safeText(article.articleNumber ?? article.mpn, 80);
  const oemNumbers = collectOem(article);

  const askedMpn = normalizePartNumber(input.manufacturerPartNumber);
  const askedOem = normalizePartNumber(input.oemNumber);

  const matchesMpn = Boolean(askedMpn) && normalizePartNumber(mpn) === askedMpn;
  const matchesOem = Boolean(askedOem) && oemNumbers.some(o => normalizePartNumber(o) === askedOem);

  // `likely` needs an actual number match. A catalogue row that merely came
  // back from a text search is `unverified`, exactly like a marketplace hit.
  const fitmentStatus = matchesMpn || matchesOem ? 'likely' : 'unverified';
  const fitmentReason = matchesMpn
    ? 'Catalogue lists this as the same part number. Vehicle fitment is not confirmed.'
    : matchesOem
      ? 'Catalogue cross-references this to the OEM number supplied. Vehicle fitment is not confirmed.'
      : 'Catalogue search result. No part-number or vehicle match was confirmed.';

  return {
    provider: 'catalog',
    providerListingId: safeText(article.id ?? article.articleId, 80),
    title,
    description: safeText(article.description),
    brand: safeText(article.brand ?? article.brandName ?? article.supplier, 80),
    manufacturerPartNumber: mpn,
    oemNumbers: oemNumbers.length ? oemNumbers : undefined,
    imageUrl: firstImage(article),
    // A catalogue publishes identity, not an offer. No currency amount is
    // claimed, so landed cost stays unknown rather than being reported as
    // zero — which would rank it as free.
    currency: input.currency ?? 'USD',
    itemPrice: undefined,
    shippingCost: undefined,
    estimatedTax: null,
    estimatedImportDuty: null,
    landedCost: undefined,
    landedCostCompleteness: 'unknown',
    fitmentStatus,
    fitmentReason,
    sourceCheckedAt: opts.checkedAt,
  };
}

export function normalizeAutoPartsResponse(
  payload: unknown,
  input: PartsSearchInput,
  opts: { checkedAt: string },
): NormalizedPartResult[] {
  const rows: AutoPartsArticle[] = Array.isArray(payload)
    ? payload as AutoPartsArticle[]
    : Array.isArray((payload as { data?: unknown })?.data)
      ? (payload as { data: AutoPartsArticle[] }).data
      : Array.isArray((payload as { items?: unknown })?.items)
        ? (payload as { items: AutoPartsArticle[] }).items
        : Array.isArray((payload as { articles?: unknown })?.articles)
          ? (payload as { articles: AutoPartsArticle[] }).articles
          : [];

  return rows
    .map(r => normalizeAutoPartsArticle(r, input, opts))
    .filter((r): r is NormalizedPartResult => r !== null);
}
