/**
 * Tax rates are stored as fractions (6.35% is 0.0635) on shop_settings,
 * estimates and invoices, and typed and shown as percentages.
 *
 * Every conversion goes through here. Reported 2026-10-12 by a US shop with a
 * 6.35% sales tax: the invoice editor rounded it to 6% on edit, the estimate
 * editor to one decimal, and the emailed invoice divided the stored fraction
 * by 100 a second time, so $40.32 of tax arrived as cents.
 */

/** 0.0635 → 6.35. Rounded to 4 places so 0.07 reads 7, not 7.000000000000001. */
export function taxRateToPercent(rate: number | null | undefined): number {
  const r = Number(rate);
  if (!Number.isFinite(r)) return 0;
  return Math.round(r * 100 * 10_000) / 10_000;
}

/** 6.35 → 0.0635. */
export function percentToTaxRate(percent: number | null | undefined): number {
  const p = Number(percent);
  if (!Number.isFinite(p)) return 0;
  return Math.round(p * 10_000) / 1_000_000;
}

/** Label text for a stored rate: 0.0635 → "6.35", 0.08 → "8". */
export function formatTaxPercent(rate: number | null | undefined): string {
  return String(taxRateToPercent(rate));
}

/** Tax on a taxable amount at a stored rate, to the cent. */
export function taxAmount(taxable: number, rate: number | null | undefined): number {
  const r = Number(rate);
  if (!Number.isFinite(r) || !Number.isFinite(taxable)) return 0;
  return Math.round(taxable * r * 100) / 100;
}
