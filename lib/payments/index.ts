/**
 * Public API for the Redlined1 payment layer.
 * Import everything from here — do not import from sub-files directly.
 */

export type {
  PaymentProviderName,
  BillingInterval,
  RedlinedPlanId,
  SubscriptionStatus,
  CheckoutSessionInput,
  CheckoutSessionResult,
  CustomerPortalInput,
  CustomerPortalResult,
  RedlinedCustomer,
  RedlinedSubscription,
  WebhookVerificationResult,
  PaymentWebhookEvent,
} from './types';

export type { PaymentProvider } from './payment-provider';

export { getPaymentProvider, _resetProviderCache } from './payment-service';
