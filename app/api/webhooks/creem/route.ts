/**
 * POST /api/webhooks/creem
 *
 * Receives and processes Creem.io webhook events.
 *
 * NOTE: this route is NOT reachable in production today. proxy.ts lists '/api/billing/webhook' in PUBLIC_PATHS
 * and not this path, so a request from Creem — which carries no session — never gets here; Creem delivers to
 * app/api/billing/webhook/creem. lib/billing/__tests__/billingStatusSync.test.ts pins that on purpose. This file is
 * kept correct regardless, so that it is safe on the day someone does route traffic to it.
 *
 * Pipeline:
 *   1. Read raw body (required for HMAC verification)
 *   2. Verify Creem signature
 *   3. Parse and normalize the event
 *   4. Record event (idempotent — an applied event is a duplicate; a recorded, unapplied one is a retry)
 *   5. Sync subscription state to Supabase
 *   6. Mark event processed — ONLY when it was applied or deliberately ignored
 *
 * HTTP answers. Creem redelivers on a non-2xx, so non-2xx is reserved for what a redelivery can fix:
 *
 *   401  signature missing or wrong             nothing is recorded or read
 *   400  body is not a parseable event          permanent: the bytes will not change
 *   200  applied                                marked processed
 *   200  ignored (not ours, not acted on,       marked processed, so a redelivery is a harmless duplicate
 *        provider has no such subscription)
 *   200  duplicate of an applied event          nothing is written again
 *   200  held: the event itself is invalid      left UNPROCESSED. 200 because unchanged bytes cannot succeed and a
 *        (plan unprovable, no buyer, …)          redelivery would only repeat the failure; a manual resend after the
 *                                               cause is fixed is processed normally.
 *   500  retryable: a database write, the        left UNPROCESSED, so Creem's redelivery tries again
 *        event record, the processed mark, or
 *        the provider read failed
 *
 * This used to answer 200 for EVERY processing error ("to prevent Creem retrying indefinitely"), which turned a
 * failed database write into an acknowledged event that nothing would ever retry. How often and for how long
 * Creem redelivers is Creem's policy and has not been verified from here.
 *
 * Nothing about the event body, the signature or any secret is logged or returned. Logs carry a fixed reason and
 * a masked event reference.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPaymentProvider } from '@/lib/payments/payment-service';
import { parseCreemWebhook } from '@/lib/payments/webhooks/creem-webhook';
import { CreemSubscriptionUnusableError } from '@/lib/payments/providers/creem-provider';
import {
  recordPaymentEvent,
  syncSubscriptionFromProvider,
  markEventProcessed,
  extractSubscriptionFromCheckout,
  BillingFactsError,
  type EventOutcome,
} from '@/lib/billing/billing-service';
import type { PaymentWebhookEvent } from '@/lib/payments/types';

export const runtime = 'nodejs';

/** Last four characters only: enough to find the event in the Creem dashboard, not enough to be the id. */
function maskRef(id: string): string {
  return id ? `…${id.slice(-4)}` : '(no id)';
}

/**
 * Events whose meaning is decided by the provider's CURRENT state, read with getSubscription, not by the event
 * name. paused and resumed are here so the approved rule (paused -> suspended, and back) can actually fire from
 * the events Creem sends; active and paid are Creem's own activation and renewal names.
 */
const READ_CURRENT_STATE = new Set([
  'subscription.created', 'subscription.updated', 'subscription.renewed',
  'subscription.active', 'subscription.paid', 'subscription.paused', 'subscription.resumed',
]);

/** Everything a failure can be classified by. A thrown error is invalid only when it says the DATA is unusable. */
function outcomeOf(err: unknown): EventOutcome {
  if (err instanceof BillingFactsError) return { kind: 'invalid', reason: err.reason };
  if (err instanceof CreemSubscriptionUnusableError) return { kind: 'invalid', reason: err.reason };
  return { kind: 'retryable', reason: 'processing failed' };
}

async function handleEvent(event: PaymentWebhookEvent): Promise<EventOutcome> {
  const provider = getPaymentProvider();
  const data = event.data as Record<string, unknown>;

  if (event.type === 'checkout.completed') {
    const sub = extractSubscriptionFromCheckout(event);   // throws BillingFactsError for "ours, unreadable"
    if (!sub) return { kind: 'ignored', reason: 'not a Redlined1 checkout' };
    return syncSubscriptionFromProvider(sub);
  }

  // A Map, not an object literal: 'toString' in {} is true, and an event type must never match a prototype key.
  const overrides = new Map<string, 'canceled' | 'expired' | 'past_due'>([
    ['subscription.canceled', 'canceled'],
    ['subscription.expired',  'expired'],
    ['subscription.past_due', 'past_due'],
  ]);

  if (READ_CURRENT_STATE.has(event.type) || overrides.has(event.type)) {
    const id = typeof data.id === 'string' ? data.id.trim() : '';
    // A subscription event without its id cannot be looked up; asking for "/subscriptions/" would fail forever.
    if (!id) return { kind: 'invalid', reason: 'the subscription event names no subscription id' };

    const sub = await provider.getSubscription(id);         // throws: unusable data, or a retryable failure
    if (!sub) return { kind: 'ignored', reason: 'the provider has no such subscription' };
    const override = overrides.get(event.type);
    if (override) sub.status = override;
    return syncSubscriptionFromProvider(sub);
  }

  return { kind: 'ignored', reason: 'an event type this route does not act on' };
}

// Must read raw body — do NOT let Next.js parse JSON before signature verification
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => { headers[key] = value; });

  // 1. Verify signature
  const provider = getPaymentProvider();
  const verification = await provider.verifyWebhook(rawBody, headers);
  if (!verification.valid) {
    console.warn('[webhook/creem] Signature verification failed:', verification.error);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 2. Parse event. The error itself is not logged: a JSON parse error quotes the text it failed on, which is the
  //    event body.
  let event: PaymentWebhookEvent;
  try {
    event = parseCreemWebhook(rawBody);
  } catch {
    console.error('[webhook/creem] Payload is not a parseable event');
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const ref = maskRef(event.providerEventId);

  // 3. Record event
  const recorded = await recordPaymentEvent(event);
  if (recorded === 'duplicate') return NextResponse.json({ received: true, duplicate: true });
  if (recorded === 'error') {
    console.error(`[webhook/creem] ${ref} could not be recorded; asking for redelivery`);
    return NextResponse.json({ error: 'Temporary processing failure' }, { status: 500 });
  }

  // 4. Process event
  let outcome: EventOutcome;
  try {
    outcome = await handleEvent(event);
  } catch (err) {
    outcome = outcomeOf(err);
  }

  // 5. Answer. Only applied and ignored events are marked processed.
  if (outcome.kind === 'retryable') {
    console.error(`[webhook/creem] ${ref} ${event.type} retryable: ${outcome.reason}`);
    return NextResponse.json({ error: 'Temporary processing failure' }, { status: 500 });
  }
  if (outcome.kind === 'invalid') {
    console.warn(`[webhook/creem] ${ref} ${event.type} held, not applied: ${outcome.reason}`);
    return NextResponse.json({ received: true, held: true });
  }

  const marked = await markEventProcessed(event.providerEventId, event.provider);
  if (!marked) {
    // Applied but not recorded as applied. 5xx so the redelivery repeats the (idempotent) writes and the mark.
    console.error(`[webhook/creem] ${ref} applied but could not be marked processed; asking for redelivery`);
    return NextResponse.json({ error: 'Temporary processing failure' }, { status: 500 });
  }
  return outcome.kind === 'ignored'
    ? NextResponse.json({ received: true, ignored: true })
    : NextResponse.json({ received: true, type: event.type });
}
