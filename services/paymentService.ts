/**
 * Compatibility wrapper. The payment ledger lives in lib/domain/payments.ts.
 *
 * updatePayment and deletePayment are GONE as of M2. Payments are append-only
 * in the database now, so those calls would fail anyway; removing them makes
 * that a compile error at the call site instead of a runtime one in front of a
 * customer.
 *
 * Their replacements:
 *   updatePayment(id, fields)  →  correctPayment(id, corrected, reason)
 *   deletePayment(id)          →  reversePayment(id, reason)
 */
import { browserDeps } from '@/lib/domain/browserAdapter';
import {
  createPaymentDomain, netAmount, liveEntries, LedgerError,
  type DomainPayment, type PaymentInput,
} from '@/lib/domain/payments';

export type Payment = DomainPayment;
export type { PaymentInput };
export { netAmount, liveEntries, LedgerError };

async function domain() {
  return createPaymentDomain(await browserDeps());
}

export async function fetchPayments(): Promise<Payment[]> {
  return (await domain()).list();
}

export async function createPayment(p: PaymentInput): Promise<Payment> {
  return (await domain()).create(p);
}

/** Cancels an entry by appending its opposite. Returns the reversal row. */
export async function reversePayment(id: string, reason: string): Promise<Payment> {
  return (await domain()).reverse(id, reason);
}

/** Reverses a wrong entry and records the corrected one. */
export async function correctPayment(
  id: string, corrected: PaymentInput, reason: string,
): Promise<{ reversal: Payment; replacement: Payment }> {
  return (await domain()).correct(id, corrected, reason);
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
