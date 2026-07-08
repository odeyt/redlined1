/**
 * POST /api/billing/webhook/creem
 * Receives and processes Creem webhook events.
 *
 * - No auth required (webhook from Creem)
 * - Verifies HMAC signature if CREEM_WEBHOOK_SECRET is set
 * - Idempotent: skips events already processed by provider_event_id
 * - Stores all events in billing_events table
 */

import { NextRequest, NextResponse } from 'next/server';
import { processWebhook } from '@/commercial/billing/billingService';

export async function POST(req: NextRequest) {
  try {
    const rawBody  = await req.text();
    const signature = req.headers.get('x-creem-signature') ??
                      req.headers.get('x-webhook-signature') ?? '';

    const result = await processWebhook(rawBody, signature, 'creem');

    if (!result.success) {
      console.error('[webhook/creem]', result.error);
      // Return 400 only for invalid signature; 200 for processing errors to avoid Creem retries
      if (result.error === 'Invalid webhook' || result.error === 'Invalid JSON') {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[webhook/creem] unhandled error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
