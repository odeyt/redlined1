/**
 * Payment provider factory.
 * Returns the correct PaymentProvider based on the PAYMENT_PROVIDER env var.
 *
 * Usage (server-side only):
 *   const provider = getPaymentProvider();
 *   const result = await provider.createCheckoutSession(...);
 *
 * To add a new provider:
 *   1. Implement PaymentProvider in providers/<name>-provider.ts
 *   2. Add a case here
 *   3. Set PAYMENT_PROVIDER=<name>
 */

import type { PaymentProvider } from './payment-provider';

let _cached: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (_cached) return _cached;

  const name = process.env.PAYMENT_PROVIDER;

  switch (name) {
    case 'creem': {
      const { CreemPaymentProvider } = require('./providers/creem-provider') as typeof import('./providers/creem-provider');
      _cached = new CreemPaymentProvider();
      return _cached;
    }
    case 'stripe': {
      const { StripePaymentProvider } = require('./providers/stripe-provider') as typeof import('./providers/stripe-provider');
      _cached = new StripePaymentProvider();
      return _cached;
    }
    default:
      throw new Error(
        `Unsupported payment provider: "${name ?? '(not set)'}". ` +
        `Set PAYMENT_PROVIDER=creem (or stripe) in your environment variables.`
      );
  }
}

/** Resets the cached provider — used in tests only. */
export function _resetProviderCache(): void {
  _cached = null;
}
