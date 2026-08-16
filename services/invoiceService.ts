/**
 * Compatibility wrapper. Invoice persistence now lives in
 * lib/domain/invoices.ts; the arithmetic and row mapping live in
 * lib/domain/invoiceMath.ts and are re-exported below so every existing import
 * path keeps working.
 *
 * There is still exactly one implementation of an invoice total. That was the
 * constraint the move had to respect: a second one, reachable from an API or
 * an AI tool, is how two parts of a system come to disagree about what a
 * customer owes.
 */
import { getShopId } from '@/lib/shopStore';
import { nextDocumentNumber } from './documentNumberService';
import { browserDeps } from '@/lib/domain/browserAdapter';
import { createInvoiceDomain } from '@/lib/domain/invoices';
import type { InvoiceFull } from '@/lib/domain/invoiceMath';

export { calculateTotals, getEffectiveTotal, mapInvoiceRow } from '@/lib/domain/invoiceMath';
export type { InvoiceLine, InvoiceFull, InvoiceTotals } from '@/lib/domain/invoiceMath';

async function domain() {
  return createInvoiceDomain(await browserDeps());
}

export async function fetchInvoices(): Promise<InvoiceFull[]> {
  return (await domain()).list();
}

export async function createInvoice(inv: Omit<InvoiceFull, 'id' | 'createdAt'>): Promise<InvoiceFull> {
  return (await domain()).create(inv);
}

export async function updateInvoice(id: string, updates: Partial<InvoiceFull>): Promise<void> {
  return (await domain()).update(id, updates);
}

export async function markInvoicePaid(id: string): Promise<void> {
  await (await domain()).markPaid(id);

  // Both hooks stay here rather than in the domain layer. They are outbound
  // integrations, and whether a webhook- or AI-initiated payment should also
  // fire them is a decision for the event milestone. Fire-and-forget; neither
  // may affect production.
  try {
    const { publishEvent } = await import('@/intelligence/IntelligenceService');
    publishEvent('InvoicePaid', getShopId(), '', 'invoice', id);
  } catch { /* intelligence must never affect production */ }
  try {
    const { supabase } = await import('@/lib/supabase');
    const { publishSapeleeEvent } = await import('@/lib/sapelee/publish');
    // No amount: there is no stored total column, and re-deriving it here just
    // to populate an event would be a second source of truth for money.
    publishSapeleeEvent(supabase, {
      eventType: 'payment.received',
      payload: { invoiceId: id },
      shopId: getShopId(),
      aggregateType: 'invoice',
      aggregateId: id,
    });
  } catch { /* sapelee integration must never affect production */ }
}

export async function deleteInvoice(id: string): Promise<void> {
  return (await domain()).remove(id);
}

export async function nextInvoiceNumber(): Promise<string> {
  return nextDocumentNumber('invoice');
}

export async function cloneInvoice(inv: InvoiceFull): Promise<InvoiceFull> {
  const newNumber = await nextInvoiceNumber();
  const clonedNotes = inv.notes
    ? `[Cloned from ${inv.invoiceNumber}]\n${inv.notes}`
    : `[Cloned from ${inv.invoiceNumber}]`;
  return createInvoice({
    invoiceNumber: newNumber,
    customerName: inv.customerName,
    customerId: inv.customerId,
    vehicle: inv.vehicle,
    jobCardId: inv.jobCardId,
    status: 'Draft',
    lines: inv.lines,
    discount: inv.discount,
    shopSupplies: inv.shopSupplies,
    taxRate: inv.taxRate,
    notes: clonedNotes,
    dueDate: '',
    paidDate: null,
    currency: inv.currency,
  });
}

export const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'ARS', symbol: 'AR$', name: 'Argentine Peso' },
  { code: 'CLP', symbol: 'CL$', name: 'Chilean Peso' },
  { code: 'COP', symbol: 'CO$', name: 'Colombian Peso' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'ILS', symbol: '₪', name: 'Israeli Shekel' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong' },
  { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee' },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka' },
  { code: 'LAK', symbol: '₭', name: 'Lao Kip' },
];


export function formatMoney(amount: number, currencyCode: string): string {
  // Round UP to nearest 10
  const rounded = Math.ceil(amount / 10) * 10;
  try {
    return rounded.toLocaleString('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  } catch {
    const sym = CURRENCIES.find(c => c.code === currencyCode)?.symbol ?? currencyCode;
    return `${sym}${rounded.toLocaleString()}`;
  }
}
