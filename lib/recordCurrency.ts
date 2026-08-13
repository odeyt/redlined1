/**
 * Keep a record's currency honest about what its lines are priced in.
 *
 * Parts quotations and orders store a `currency` on the record AND a currency
 * on each line. Setting a line's currency never updated the record's, so it
 * kept whatever the form defaulted to — producing rows that say THB while
 * every line is in LAK. Found in production on 2026-08-12: four quotations
 * and five orders disagreed with their own line items.
 *
 * That is not cosmetic. The record's currency is what the deposit converts
 * into, what convert-to-order targets, and what totals are reported in. A
 * quote priced in LAK but labelled THB understates itself by roughly 25x to
 * anything reading the column rather than the lines.
 *
 * Applied in the services rather than the form, so it holds no matter which
 * screen or code path wrote the record. A form-level fix would need repeating
 * in every editor and would miss conversions between the two.
 */

export interface CurrencyBearingLine {
  // Nullable as well as optional: parts order lines type it as
  // `string | null | undefined`, and all three mean the same thing here —
  // this line does not name a currency of its own.
  currency?: string | null;
}

/**
 * The currency a record should carry, given its lines.
 *
 * Only overrides when EVERY line names the same explicit currency. Ambiguity
 * is left alone deliberately:
 *
 *   - a line with no currency means "same as the record", so it cannot argue
 *     with the record about what that is;
 *   - genuinely mixed lines have no single answer, and the existing
 *     multi-currency display already handles them.
 */
export function deriveRecordCurrency<T extends CurrencyBearingLine>(
  lines: readonly T[] | undefined,
  fallback: string,
): string {
  const named = (lines ?? [])
    .map(l => l.currency?.trim())
    .filter((c): c is string => !!c);

  // Some line left it blank — it inherits the record, so no disagreement.
  if (named.length === 0 || named.length !== (lines ?? []).length) return fallback || 'USD';

  const unique = [...new Set(named)];
  if (unique.length !== 1) return fallback || 'USD';

  return unique[0];
}
