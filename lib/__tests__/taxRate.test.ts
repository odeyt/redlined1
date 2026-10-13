/**
 * Reported 2026-10-12 by a US shop with 6.35% sales tax: the rate would not
 * stick on estimates or invoices, and an emailed $635 invoice showed cents of
 * tax instead of $40.32.
 */
import fs from 'node:fs';
import path from 'node:path';
import { taxRateToPercent, percentToTaxRate, formatTaxPercent, taxAmount } from '../taxRate';
import { sanitizeDecimal } from '@/components/DecimalInput';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('tax rate conversions', () => {
  it('round-trips a two-decimal rate exactly', () => {
    expect(percentToTaxRate(6.35)).toBe(0.0635);
    expect(taxRateToPercent(0.0635)).toBe(6.35);
    expect(taxRateToPercent(percentToTaxRate(7.25))).toBe(7.25);
  });

  it('shows whole rates without float noise', () => {
    expect(taxRateToPercent(0.07)).toBe(7);
    expect(formatTaxPercent(0.07)).toBe('7');
    expect(formatTaxPercent(0.0635)).toBe('6.35');
  });

  it('treats missing or junk values as zero', () => {
    expect(taxRateToPercent(null)).toBe(0);
    expect(taxRateToPercent(undefined)).toBe(0);
    expect(percentToTaxRate(NaN)).toBe(0);
  });

  it('charges $40.32 on $635 at 6.35%', () => {
    expect(taxAmount(635, 0.0635)).toBe(40.32);
  });
});

describe('sanitizeDecimal', () => {
  it('keeps the decimal point while typing', () => {
    expect(sanitizeDecimal('6.')).toBe('6.');
    expect(sanitizeDecimal('6.35')).toBe('6.35');
  });

  it('drops letters and extra points', () => {
    expect(sanitizeDecimal('6.3.5%')).toBe('6.35');
    expect(sanitizeDecimal('$12.50')).toBe('12.50');
  });
});

describe('emailed estimates and invoices', () => {
  it('applies the stored fraction once, not divided by 100 again', () => {
    const src = read('app/api/send-document/route.ts');
    expect(src).not.toMatch(/taxRate\s*\/\s*100/);
    expect(src.match(/taxAmount\(subtotal - discount \+ shopSupplies, taxRate\)/g)).toHaveLength(2);
  });
});

describe('new estimates and invoices', () => {
  it('start at the shop default tax rate from Settings', () => {
    expect(read('features/invoices/InvoicesView.tsx')).toMatch(/const taxRate = shopSettings\?\.defaultTaxRate \?\? 0;/);
    expect(read('features/estimates/EstimatesView.tsx')).toMatch(/taxRate: shopSettings\?\.defaultTaxRate \?\? 0 \}\);/);
  });

  it('keep the full rate when an invoice is edited', () => {
    const src = read('features/invoices/InvoicesView.tsx');
    expect(src).toMatch(/taxPct: taxRateToPercent\(inv\.taxRate\)/);
    expect(src).not.toMatch(/Math\.round\(\(inv\.taxRate \?\? 0\) \* 100\)/);
  });
});
