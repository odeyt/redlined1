import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';

export interface Payment {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerId: string;
  amount: number;
  method: string;
  methodDetail: string;
  status: string;
  notes: string;
  currency: string;
  referenceNumber: string;
  paymentDate: string;
  createdAt: string;
}

function mapRow(r: Record<string, unknown>): Payment {
  return {
    id: r.id as string,
    invoiceNumber: (r.invoice_number as string) || '',
    customerName: (r.customer_name as string) || '',
    customerId: (r.customer_id as string) || '',
    amount: Number(r.amount ?? 0),
    method: (r.method as string) || 'Cash',
    methodDetail: (r.method_detail as string) || '',
    status: (r.status as string) || 'Recorded',
    notes: (r.notes as string) || '',
    currency: (r.currency as string) || 'USD',
    referenceNumber: (r.reference_number as string) || '',
    paymentDate: (r.payment_date as string) || '',
    createdAt: (r.created_at as string) || '',
  };
}

export async function fetchPayments(): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('shop_id', getShopId())
    .order('payment_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function createPayment(p: Omit<Payment, 'id' | 'createdAt'>): Promise<Payment> {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      shop_id: getShopId(),
      invoice_number: p.invoiceNumber || null,
      customer_name: p.customerName,
      customer_id: p.customerId || null,
      amount: p.amount,
      method: p.method,
      method_detail: p.methodDetail,
      status: p.status,
      notes: p.notes,
      currency: p.currency,
      reference_number: p.referenceNumber,
      payment_date: p.paymentDate || new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function updatePayment(id: string, updates: Partial<Payment>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.invoiceNumber !== undefined) payload.invoice_number = updates.invoiceNumber || null;
  if (updates.customerName !== undefined) payload.customer_name = updates.customerName;
  if (updates.amount !== undefined) payload.amount = updates.amount;
  if (updates.method !== undefined) payload.method = updates.method;
  if (updates.methodDetail !== undefined) payload.method_detail = updates.methodDetail;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.notes !== undefined) payload.notes = updates.notes;
  if (updates.currency !== undefined) payload.currency = updates.currency;
  if (updates.referenceNumber !== undefined) payload.reference_number = updates.referenceNumber;
  if (updates.paymentDate !== undefined) payload.payment_date = updates.paymentDate;
  const { error } = await supabase.from('payments').update(payload).eq('id', id).eq('shop_id', getShopId());
  if (error) throw error;
}

export async function deletePayment(id: string): Promise<void> {
  const { error } = await supabase.from('payments').delete().eq('id', id).eq('shop_id', getShopId());
  if (error) throw error;
}

export const PAYMENT_METHODS = [
  { value: 'Cash',              label: '💵 Cash',                  group: 'In Person' },
  { value: 'Other (Cash)',      label: '💵 Other (Cash)',           group: 'In Person' },
  { value: 'Check',             label: '🏦 Check',                  group: 'In Person' },
  { value: 'Credit Card',       label: '💳 Credit Card',            group: 'Card' },
  { value: 'Debit Card',        label: '💳 Debit Card',             group: 'Card' },
  { value: 'Visa',              label: '💳 Visa',                   group: 'Card' },
  { value: 'Mastercard',        label: '💳 Mastercard',             group: 'Card' },
  { value: 'Amex',              label: '💳 American Express',       group: 'Card' },
  { value: 'Discover',          label: '💳 Discover',               group: 'Card' },
  { value: 'PayPal',            label: '🅿️ PayPal',                group: 'Digital' },
  { value: 'Apple Pay',         label: '🍎 Apple Pay',              group: 'Digital' },
  { value: 'Google Pay',        label: '🤖 Google Pay',             group: 'Digital' },
  { value: 'Venmo',             label: '💜 Venmo',                  group: 'Digital' },
  { value: 'Zelle',             label: '💛 Zelle',                  group: 'Digital' },
  { value: 'Bank Transfer',     label: '🏛 Bank Transfer / ACH',    group: 'Bank' },
  { value: 'Wire Transfer',     label: '🏛 Wire Transfer',          group: 'Bank' },
  { value: 'Fleet Account',     label: '📋 Fleet Account / Net 30', group: 'Account' },
  { value: 'Bitcoin',           label: '₿ Bitcoin',                 group: 'Crypto' },
  { value: 'Ethereum',          label: 'Ξ Ethereum',                group: 'Crypto' },
  { value: 'USDC',              label: '🪙 USDC / Stablecoin',      group: 'Crypto' },
  { value: 'Other Crypto',      label: '🔗 Other Crypto',           group: 'Crypto' },
];
