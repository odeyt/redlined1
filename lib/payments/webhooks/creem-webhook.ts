/**
 * Creem webhook event normalizer.
 *
 * Translates Creem-specific webhook payloads into Redlined1's
 * provider-agnostic PaymentWebhookEvent shape.
 *
 * This file is the only place Creem event types should be referenced.
 */

import type { PaymentWebhookEvent } from '../types';

/** Maps Creem event type strings to normalized Redlined1 event types. */
export function normalizeCreemEventType(creemType: string): string {
  const map: Record<string, string> = {
    'checkout.completed':          'checkout.completed',
    'subscription.created':        'subscription.created',
    'subscription.updated':        'subscription.updated',
    'subscription.canceled':       'subscription.canceled',
    'subscription.cancelled':      'subscription.canceled',
    'subscription.expired':        'subscription.expired',
    'subscription.past_due':       'subscription.past_due',
    'subscription.renewed':        'subscription.renewed',
    'invoice.paid':                'invoice.paid',
    'invoice.payment_failed':      'invoice.payment_failed',
  };
  return map[creemType] ?? creemType;
}

/** Parses a raw Creem webhook body into a PaymentWebhookEvent. */
export function parseCreemWebhook(rawBody: string): PaymentWebhookEvent {
  const payload = JSON.parse(rawBody) as Record<string, unknown>;
  const eventType = payload.event_type ?? payload.type ?? payload.event ?? 'unknown';

  return {
    id: `creem_${payload.id ?? Date.now()}`,
    provider: 'creem',
    type: normalizeCreemEventType(String(eventType)),
    providerEventId: String(payload.id ?? ''),
    data: (payload.data ?? payload) as Record<string, unknown>,
    rawBody,
  };
}
