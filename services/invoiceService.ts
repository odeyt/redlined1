import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';

export interface InvoiceLine {
  note: string;
  description: string;
  laoDescription?: string;
  qty: number;
  rate: number;
  cost?: number;
  markup?: number;
  currency?: string;
}

export interface InvoiceFull {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerId: string;
  vehicle: string;
  jobCardId: string;
  status: string;
  lines: InvoiceLine[];
  discount: number;
  shopSupplies: number;
  taxRate: number;
  notes: string;
  dueDate: string;
  paidDate: string | null;
  createdAt: string;
  currency: string;
}

export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  shopSupplies: number;
  tax: number;
  total: number;
  /** Subtotals keyed by currency — each line's rate is in its own currency */
  byCurrency: Record<string, number>;
}

function mapRow(r: Record<string, unknown>): InvoiceFull {
  return {
    id: r.number as string,
    invoiceNumber: (r.number as string) || '',
    customerName: (r.customer as string) || '',
    customerId: (r.customer_id as string) || '',
    vehicle: (r.vehicle as string) || '',
    jobCardId: (r.job_card as string) || '',
    status: (r.status as string) || 'Draft',
    lines: (r.lines as InvoiceLine[]) || [],
    discount: Number(r.discount ?? 0),
    shopSupplies: Number(r.shop_supplies ?? 0),
    taxRate: Number(r.tax_rate ?? 0.08),
    notes: (r.notes as string) || '',
    dueDate: (r.due_date as string) || '',
    paidDate: (r.paid_date as string) || null,
    createdAt: (r.created_at as string) || '',
    currency: (r.currency as string) || 'USD',
  };
}

export function calculateTotals(inv: InvoiceFull): InvoiceTotals {
  // Group line totals by their own currency
  const byCurrency: Record<string, number> = {};
  for (const l of inv.lines) {
    const lc = l.currency || inv.currency;
    byCurrency[lc] = (byCurrency[lc] ?? 0) + l.qty * l.rate;
  }
  // Subtotal / total are in the invoice's base currency only;
  // cross-currency lines are shown inline and in byCurrency breakdown.
  const subtotal = byCurrency[inv.currency] ?? 0;
  const afterDiscount = Math.max(subtotal - inv.discount, 0);
  const taxable = afterDiscount + inv.shopSupplies;
  const tax = taxable * inv.taxRate;
  const total = taxable + tax;
  return { subtotal, discount: inv.discount, shopSupplies: inv.shopSupplies, tax, total, byCurrency };
}

export async function fetchInvoices(): Promise<InvoiceFull[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('shop_id', getShopId())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function createInvoice(inv: Omit<InvoiceFull, 'id' | 'createdAt'>): Promise<InvoiceFull> {
  const { data, error } = await supabase
    .from('invoices')
    .insert({
      shop_id: getShopId(),
      number: inv.invoiceNumber,
      customer: inv.customerName,
      customer_id: inv.customerId || null,
      vehicle: inv.vehicle,
      job_card: inv.jobCardId || null,
      status: inv.status,
      lines: inv.lines,
      discount: inv.discount,
      shop_supplies: inv.shopSupplies,
      tax_rate: inv.taxRate,
      notes: inv.notes,
      due_date: inv.dueDate || null,
      currency: inv.currency || 'USD',
    })
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function updateInvoice(id: string, updates: Partial<InvoiceFull>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.customerName !== undefined) payload.customer = updates.customerName;
  if (updates.customerId !== undefined) payload.customer_id = updates.customerId || null;
  if (updates.vehicle !== undefined) payload.vehicle = updates.vehicle;
  if (updates.jobCardId !== undefined) payload.job_card = updates.jobCardId || null;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.lines !== undefined) payload.lines = updates.lines;
  if (updates.discount !== undefined) payload.discount = updates.discount;
  if (updates.shopSupplies !== undefined) payload.shop_supplies = updates.shopSupplies;
  if (updates.taxRate !== undefined) payload.tax_rate = updates.taxRate;
  if (updates.notes !== undefined) payload.notes = updates.notes;
  if (updates.dueDate !== undefined) payload.due_date = updates.dueDate || null;
  if (updates.paidDate !== undefined) payload.paid_date = updates.paidDate || null;
  if (updates.currency !== undefined) payload.currency = updates.currency;
  const { error } = await supabase.from('invoices').update(payload).eq('number', id).eq('shop_id', getShopId());
  if (error) throw error;
}

export async function markInvoicePaid(id: string): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({ status: 'Paid', paid_date: new Date().toISOString() })
    .eq('number', id)
    .eq('shop_id', getShopId());
  if (error) throw error;
}

export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await supabase.from('invoices').delete().eq('number', id).eq('shop_id', getShopId());
  if (error) throw error;
}

export async function nextInvoiceNumber(): Promise<string> {
  const { data } = await supabase
    .from('invoices')
    .select('number')
    .order('created_at', { ascending: false })
    .limit(1000);
  const nums = (data ?? []).map(r => Number(String(r.number ?? '').replace('INV-', '')) || 0);
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `INV-${String(max + 1).padStart(4, '0')}`;
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
