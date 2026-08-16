/**
 * Compatibility wrapper. The payment logic now lives in lib/domain/payments.ts.
 *
 * Signatures are unchanged, so no view was touched. Two of them —
 * updatePayment and deletePayment — are destructive edits of financial records
 * with no ledger behind them. M1 does not fix that; it routes them through one
 * place and makes them produce an audit row. They are scheduled for removal in
 * M2, which replaces them with adjustment and reversal entries.
 *
 * Callers of the two legacy functions are listed in
 * docs/domain-service-architecture.md so the M2 removal has a known blast
 * radius.
 */
import { browserDeps } from '@/lib/domain/browserAdapter';
import { createPaymentDomain, type DomainPayment } from '@/lib/domain/payments';

export type Payment = DomainPayment;

async function domain() {
  return createPaymentDomain(await browserDeps());
}

export async function fetchPayments(): Promise<Payment[]> {
  return (await domain()).list();
}

export async function createPayment(p: Omit<Payment, 'id' | 'createdAt'>): Promise<Payment> {
  return (await domain()).create(p);
}

/** LEGACY — destructive edit of a financial record. Replaced in M2. */
export async function updatePayment(id: string, updates: Partial<Payment>): Promise<void> {
  return (await domain()).updateLegacy(id, updates);
}

/** LEGACY — hard delete of a financial record. Replaced in M2. */
export async function deletePayment(id: string): Promise<void> {
  return (await domain()).removeLegacy(id);
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
  { value: 'Cash App',          label: '💚 Cash App',               group: 'Digital' },
  { value: 'Wise',              label: '🌍 Wise',                   group: 'Digital' },
  { value: 'Bank Transfer',     label: '🏛 Bank Transfer / ACH',    group: 'Bank' },
  { value: 'Wire Transfer',     label: '🏛 Wire Transfer',          group: 'Bank' },
  { value: 'Fleet Account',     label: '📋 Fleet Account / Net 30', group: 'Account' },
  { value: 'Bitcoin',           label: '₿ Bitcoin',                 group: 'Crypto' },
  { value: 'Ethereum',          label: 'Ξ Ethereum',                group: 'Crypto' },
  { value: 'USDC',              label: '🪙 USDC / Stablecoin',      group: 'Crypto' },
  { value: 'Other Crypto',      label: '🔗 Other Crypto',           group: 'Crypto' },
];
