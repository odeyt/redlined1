/**
 * POST /api/billing/webhook/creem
 *
 * Receives and processes Creem webhook events.
 *
 * - No auth required (webhook from Creem)
 * - HMAC-SHA256 signature verification via CreemPaymentProvider.verifyWebhook()
 * - Idempotent: skips events already recorded by provider_event_id
 * - Writes to `payment_events` and `subscriptions` tables (active scaffold)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPaymentProvider } from '@/lib/payments/payment-service';
import { parseCreemWebhook } from '@/lib/payments/webhooks/creem-webhook';
import {
  recordPaymentEvent,
  markEventProcessed,
  syncSubscriptionFromProvider,
  extractSubscriptionFromCheckout,
} from '@/lib/billing/billing-service';

export async function POST(req: NextRequest) {
  let rawBody = '';

  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: 'Failed to read request body' }, { status: 400 });
  }

  // ── Signature verification ─────────────────────────────────────────────────
  const signature =
    req.headers.get('x-creem-signature') ??
    req.headers.get('x-webhook-signature') ??
    '';

  if (!process.env.CREEM_WEBHOOK_SECRET) {
    console.warn(
      '[webhook/creem] CREEM_WEBHOOK_SECRET is not set — ' +
      'signature verification skipped. Set this before going live.',
    );
  } else {
    const provider = getPaymentProvider();
    const verification = await provider.verifyWebhook(rawBody, {
      'x-creem-signature': signature,
    });

    if (!verification.valid) {
      console.error('[webhook/creem] Signature verification failed:', verification.error);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
  }

  // ── Parse event ────────────────────────────────────────────────────────────
  let event;
  try {
    event = parseCreemWebhook(rawBody);
  } catch (err) {
    console.error('[webhook/creem] Failed to parse payload:', err);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ── Idempotency check + record ─────────────────────────────────────────────
  const isNew = await recordPaymentEvent(event);
  if (!isNew) {
    // Already processed — return 200 to prevent Creem retries
    return NextResponse.json({ received: true, duplicate: true });
  }

  // ── Event handling ─────────────────────────────────────────────────────────
  try {
    switch (event.type) {
      case 'checkout.completed': {
        const sub = extractSubscriptionFromCheckout(event);
        if (sub) {
          await syncSubscriptionFromProvider(sub);
        } else {
          console.warn('[webhook/creem] checkout.completed missing user_id or plan_id in metadata');
        }
        break;
      }

      case 'subscription.created':
      case 'subscription.updated':
      case 'subscription.renewed': {
        // Re-fetch from Creem to get authoritative state
        const provider = getPaymentProvider();
        const subId = String(
          (event.data as Record<string, unknown>).subscription_id ??
          (event.data as Record<string, unknown>).id ??
          '',
        );
        if (subId) {
          const remoteSub = await provider.getSubscription(subId);
          if (remoteSub) await syncSubscriptionFromProvider(remoteSub);
        }
        break;
      }

      case 'subscription.canceled': {
        const provider = getPaymentProvider();
        const subId = String(
          (event.data as Record<string, unknown>).subscription_id ??
          (event.data as Record<string, unknown>).id ??
          '',
        );
        if (subId) {
          const remoteSub = await provider.getSubscription(subId);
          if (remoteSub) {
            await syncSubscriptionFromProvider({ ...remoteSub, status: 'canceled' });
          }
        }
        break;
      }

      case 'subscription.expired':
      case 'subscription.past_due': {
        const provider = getPaymentProvider();
        const subId = String(
          (event.data as Record<string, unknown>).subscription_id ??
          (event.data as Record<string, unknown>).id ??
          '',
        );
        if (subId) {
          const remoteSub = await provider.getSubscription(subId);
          if (remoteSub) await syncSubscriptionFromProvider(remoteSub);
        }
        break;
      }

      case 'invoice.paid':
      case 'invoice.payment_failed':
        // Recorded in payment_events for audit; no subscription state change needed
        break;

      default:
        // Unknown event — recorded for audit, no action
        console.info(`[webhook/creem] Unhandled event type: ${event.type}`);
    }

    await markEventProcessed(event.providerEventId, 'creem');
  } catch (err) {
    console.error('[webhook/creem] Event processing error:', err);
    // Return 200 so Creem does not retry — the raw event is recorded and can be replayed
    return NextResponse.json({ received: true, processingError: true });
  }

  return NextResponse.json({ received: true });
}
