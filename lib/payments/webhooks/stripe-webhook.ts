/**
 * Stripe webhook event normalizer — PLACEHOLDER.
 *
 * Implement this when activating the Stripe provider.
 * Maps Stripe event types and payloads into Redlined1's PaymentWebhookEvent.
 */

import type { PaymentWebhookEvent } from '../types';

export function normalizeStripeEventType(stripeType: string): string {
  const map: Record<string, string> = {
    'checkout.session.completed':                  'checkout.completed',
    'customer.subscription.created':               'subscription.created',
    'customer.subscription.updated':               'subscription.updated',
    'customer.subscription.deleted':               'subscription.canceled',
    'customer.subscription.trial_will_end':        'subscription.trial_ending',
    'invoice.paid':                                'invoice.paid',
    'invoice.payment_failed':                      'invoice.payment_failed',
  };
  return map[stripeType] ?? stripeType;
}

export function parseStripeWebhook(rawBody: string): PaymentWebhookEvent {
  // TODO: Use stripe.webhooks.constructEvent() with STRIPE_WEBHOOK_SECRET
  // This stub exists so the webhook route can be wired up before Stripe is implemented.
  throw new Error(
    'parseStripeWebhook is not yet implemented. ' +
    'Install the stripe package and implement this function.'
  );
  // Suppress unreachable-code warning — intentional stub shape:
  const _payload = JSON.parse(rawBody) as Record<string, unknown>;
  return {} as PaymentWebhookEvent;
}
