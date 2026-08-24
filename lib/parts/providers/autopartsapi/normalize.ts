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
  // `s3image` is the live field and is a full https URL on the provider's
  // object storage. Still allow-listed by safeHttpsUrl rather than trusted —
  // it is a third party's string.
  return safeHttpsUrl(a.s3image)
    ?? safeHttpsUrl(a.imageUrl)
    ?? safeHttpsUrl(a.image)
    ?? safeHttpsUrl(a.images?.[0]?.url);
}

/** Normalised MPN/OEM comparison — case and separators do not carry meaning. */
export function normalizePartNumber(raw: unknown): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * The vehicle marque a catalogue row belongs to.
 *
 * Exported because it is evidence, not decoration. Searching OEM
 * `04465-0K340` returns rows whose `manufacturerName` is CHRYSLER and FORD as
 * well as Toyota: OEM numbers collide across marques once punctuation is
 * normalised away. A row for the wrong marque is not evidence about the
 * vehicle on the estimate, however exactly its digits line up.
 */
export function vehicleManufacturer(article: AutoPartsArticle): string | undefined {
  return safeText(article.manufacturerName, 80);
}

export function normalizeAutoPartsArticle(
  article: AutoPartsArticle,
  input: PartsSearchInput,
  opts: { checkedAt: string },
): NormalizedPartResult | null {
  const title = safeText(article.articleProductName ?? article.name ?? article.title, 200);
  if (!title) return null;

  // `articleNo` is the aftermarket part number; `supplierName` is the brand
  // that sells it. `manufacturerName` is the VEHICLE marque and must not be
  // read as a brand — see the note on AutoPartsArticle.
  const mpn = safeText(article.articleNo ?? article.articleNumber ?? article.mpn, 80);
  const brand = safeText(article.supplierName ?? article.brand ?? article.brandName ?? article.supplier, 80);
  const marque = vehicleManufacturer(article);

  // The catalogue echoes the OEM number it matched on, in its own formatting
  // ("044650-K340" for a request of "04465-0K340"). Both normalise to the
  // same digits, which is why comparison is on normalised values.
  const matchedOem = safeText(article.articleSearchNo, 60);
  const oemNumbers = [...collectOem(article)];
  if (matchedOem) oemNumbers.unshift(matchedOem.toUpperCase());

  const askedMpn = normalizePartNumber(input.manufacturerPartNumber);
  const askedOem = normalizePartNumber(input.oemNumber ?? input.query);

  const matchesMpn = Boolean(askedMpn) && normalizePartNumber(mpn) === askedMpn;
  const matchesOem = Boolean(askedOem)
    && [...oemNumbers].some(o => normalizePartNumber(o) === askedOem);

  // Marque agreement is a separate question from number agreement, and the
  // wrong marque downgrades a row no matter how well the digits match.
  const marqueMatches = Boolean(marque) && Boolean(input.make)
    && normalizePartNumber(marque) === normalizePartNumber(input.make);

  // `likely` needs a real number match AND no marque contradiction. A row for
  // another marque stays `unverified` however exact its digits are.
  const numberMatch = matchesMpn || matchesOem;
  const fitmentStatus = numberMatch && (marqueMatches || !input.make || !marque)
    ? 'likely'
    : 'unverified';

  const fitmentReason = !numberMatch
    ? 'Catalogue search result. No part-number match was confirmed.'
    : marque && input.make && !marqueMatches
      ? `Catalogue lists this number under ${marque}, not ${input.make}. `
        + 'OEM numbers collide across marques — treat as a candidate only.'
      : matchesMpn
        ? 'Catalogue lists this as the same part number. Vehicle fitment is not confirmed.'
        : 'Catalogue cross-references this to the OEM number supplied. Vehicle fitment is not confirmed.';

  return {
    provider: 'catalog',
    // `articleId` arrives as a NUMBER (7712004) and `safeText` refuses
    // non-strings by design, so it is coerced first rather than silently
    // becoming undefined — a result with no id cannot be looked up again.
    providerListingId: safeText(String(article.articleId ?? article.id ?? ''), 80),
    title,
    description: safeText(article.description),
    brand,
    manufacturerPartNumber: mpn,
    oemNumbers: oemNumbers.length ? [...new Set(oemNumbers)].slice(0, 25) : undefined,
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

/**
 * Vehicle applicability rows, from the OEM→vehicles endpoint.
 *
 * The field names are tolerated in several forms because the exact response
 * shape has not been observed live yet. A row that yields neither a
 * manufacturer nor a model is dropped: it cannot be matched against anything,
 * and keeping it would inflate the count that the evidence model reads as
 * "the catalogue lists applications for this part".
 */
export function extractApplicability(payload: unknown): Array<{
  manufacturer?: string; model?: string; yearFrom?: number; yearTo?: number; description?: string;
}> {
  const rows: Array<Record<string, unknown>> = Array.isArray(payload)
    ? payload as Array<Record<string, unknown>>
    : Array.isArray((payload as { data?: unknown })?.data)
      ? (payload as { data: Array<Record<string, unknown>> }).data
      : Array.isArray((payload as { items?: unknown })?.items)
        ? (payload as { items: Array<Record<string, unknown>> }).items
        : [];

  const year = (v: unknown): number | undefined => {
    const n = Number(String(v ?? '').slice(0, 4));
    return Number.isInteger(n) && n > 1900 && n < 2200 ? n : undefined;
  };

  return rows.map(r => ({
    manufacturer: safeText(r.manufacturer ?? r.manufacturerName ?? r.make ?? r.brand, 80),
    model: safeText(r.model ?? r.modelName ?? r.carModel, 80),
    yearFrom: year(r.yearFrom ?? r.constructionFrom ?? r.from ?? r.yearOfConstructionFrom),
    yearTo: year(r.yearTo ?? r.constructionTo ?? r.to ?? r.yearOfConstructionTo),
    description: safeText(r.description ?? r.typeName ?? r.name, 160),
  })).filter(r => r.manufacturer || r.model);
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
