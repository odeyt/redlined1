/**
 * POST /api/webhooks/creem
 *
 * Receives and processes Creem.io webhook events.
 *
 * Pipeline:
 *   1. Read raw body (required for HMAC verification)
 *   2. Verify Creem signature
 *   3. Parse and normalize the event
 *   4. Record event (idempotent — skip if already seen)
 *   5. Sync subscription state to Supabase
 *   6. Mark event processed
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPaymentProvider } from '@/lib/payments/payment-service';
import { parseCreemWebhook } from '@/lib/payments/webhooks/creem-webhook';
import {
  recordPaymentEvent,
  syncSubscriptionFromProvider,
  markEventProcessed,
  extractSubscriptionFromCheckout,
} from '@/lib/billing/billing-service';

export const runtime = 'nodejs';

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

  // 2. Parse event
  let event;
  try {
    event = parseCreemWebhook(rawBody);
  } catch (err) {
    console.error('[webhook/creem] Parse error:', err);
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // 3. Record event — returns false if already processed (idempotent)
  const isNew = await recordPaymentEvent(event);
  if (!isNew) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // 4. Process event
  try {
    switch (event.type) {
      case 'checkout.completed': {
        const sub = extractSubscriptionFromCheckout(event);
        if (sub) await syncSubscriptionFromProvider(sub);
        break;
      }

      case 'subscription.created':
      case 'subscription.updated':
      case 'subscription.renewed': {
        const sub = await provider.getSubscription(
          String((event.data as Record<string, unknown>).id ?? ''),
        );
        if (sub) await syncSubscriptionFromProvider(sub);
        break;
      }

      case 'subscription.canceled':
      case 'subscription.expired': {
        const sub = await provider.getSubscription(
          String((event.data as Record<string, unknown>).id ?? ''),
        );
        if (sub) {
          sub.status = event.type === 'subscription.canceled' ? 'canceled' : 'expired';
          await syncSubscriptionFromProvider(sub);
        }
        break;
      }

      case 'subscription.past_due': {
        const sub = await provider.getSubscription(
          String((event.data as Record<string, unknown>).id ?? ''),
        );
        if (sub) {
          sub.status = 'past_due';
          await syncSubscriptionFromProvider(sub);
        }
        break;
      }

      default:
        // Non-subscription events (invoice.paid, etc.) are recorded but not acted on yet
        break;
    }

    await markEventProcessed(event.providerEventId, event.provider);
    return NextResponse.json({ received: true, type: event.type });
  } catch (err) {
    console.error('[webhook/creem] Processing error:', err);
    // Return 200 to prevent Creem retrying indefinitely on our processing bugs
    return NextResponse.json({ received: true, error: 'Processing error — logged' });
  }
}
