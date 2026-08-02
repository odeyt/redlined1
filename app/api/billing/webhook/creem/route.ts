import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

/** HMAC-SHA256 of the raw body, hex encoded. */
async function hmacHex(rawBody: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  return Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  try {
    const expected = signature.replace(/^sha256=/, '');
    return (await hmacHex(rawBody, secret)) === expected;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    // Creem sends `creem-signature` — no `x-` prefix (docs.creem.io/code/webhooks).
    // The `x-` spellings are kept only as a fallback in case of a proxy rewrite;
    // reading them alone meant every genuine event fell into the "missing
    // signature" branch below and was rejected with 401.
    const signature =
      req.headers.get('creem-signature') ??
      req.headers.get('x-creem-signature') ??
      req.headers.get('x-webhook-signature') ??
      '';
    const secret = process.env.CREEM_WEBHOOK_SECRET;

    // This endpoint grants plans: a processed event writes profiles.plan for the
    // user id carried in the payload. An unauthenticated caller who can reach it
    // could therefore hand any account any plan, for free — so every request
    // must be proven to come from the payment provider before it is parsed.
    //
    // It previously logged a signature mismatch and processed the event anyway,
    // and skipped verification entirely when no secret was configured. Both are
    // now hard rejections.
    if (!secret) {
      console.error('[webhook/creem] CREEM_WEBHOOK_SECRET is not set — rejecting. Billing webhooks cannot be trusted without it.');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
    }
    if (!signature) {
      console.warn('[webhook/creem] request carried no signature header — rejected');
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }
    if (!(await verifySignature(rawBody, signature, secret))) {
      // A rejected event means a customer may have paid without their plan
      // activating, so leave enough behind to diagnose and repair it — but no
      // PII. Signature values are not secret (the signing key is), while the
      // body carries customer email and payment details, so the body is logged
      // only as a length and the event type.
      let eventType = '(unparseable)';
      try { eventType = String((JSON.parse(rawBody) as Record<string, unknown>).type ?? '(none)'); } catch { /* keep placeholder */ }
      console.error('[webhook/creem] REJECTED — signature did not verify.', JSON.stringify({
        eventType,
        bodyBytes: rawBody.length,
        signatureHeaders: [...req.headers.keys()].filter(h => /sign|hmac|digest/i.test(h)),
        received: signature.slice(0, 96),
        expectedHmacSha256Hex: (await hmacHex(rawBody, secret)).slice(0, 96),
        note: 'If a payment succeeded but the plan did not activate, compare these two. A mismatch in FORMAT (base64 vs hex, or a "t=...,v1=..." scheme) means verifySignature needs to match Creem\'s scheme.',
      }));
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const eventType       = String(payload.type ?? payload.event_type ?? '');
    const providerEventId = String(payload.id ?? payload.event_id ?? '');
    const data            = (payload.data ?? payload) as Record<string, unknown>;
    const meta            = (data.metadata ?? {}) as Record<string, string>;
    const userId          = meta.user_id || null;

    const db = getAdminDb();

    // Metadata is set by our own checkout route, but a subscription can also be
    // created from Creem's dashboard, and older checkout sessions were sent
    // without shop_id at all. Falling back to the membership table means those
    // events still activate instead of being silently dropped — the customer
    // has paid either way.
    let shopId = meta.shop_id || null;
    if (!shopId && userId) {
      const { data: membership } = await db
        .from('shop_users')
        .select('shop_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      shopId = membership?.shop_id ?? null;
      if (shopId) {
        console.warn('[webhook/creem] metadata carried no shop_id; resolved it from shop_users.');
      }
    }
    if (!shopId) {
      console.error('[webhook/creem] cannot resolve a shop for this event — subscription NOT activated.', JSON.stringify({
        eventType, providerEventId, hasUserId: !!userId,
      }));
    }

    // Idempotency check
    if (providerEventId) {
      const { data: existing } = await db
        .from('billing_events')
        .select('id, processed')
        .eq('provider_event_id', providerEventId)
        .maybeSingle();
      if (existing?.processed) {
        return NextResponse.json({ received: true, skipped: 'duplicate' });
      }
    }

    // Store event
    const { data: eventRow } = await db
      .from('billing_events')
      .insert({
        shop_id:           shopId,
        provider:          'creem',
        event_type:        eventType,
        provider_event_id: providerEventId,
        payload,
        processed:         false,
      })
      .select('id')
      .single();

    // Handle subscription updates
    try {
      const isActivation =
        eventType === 'checkout.completed' ||
        eventType === 'subscription.created' ||
        eventType === 'subscription.active';

      if (isActivation) {
        // `plan_id` is what createCheckoutSession has always sent; `plan_key`
        // is what this handler was written to read. Accept either, and only
        // fall back to a default when neither is present — defaulting to
        // 'professional' silently upgraded anyone who bought a cheaper plan.
        const planKey = meta.plan_key || meta.plan_id || 'professional';
        if (!meta.plan_key && !meta.plan_id) {
          console.warn('[webhook/creem] event carried no plan in metadata; defaulting to professional.');
        }

        // Unlock the app for the buyer even if the shop row could not be
        // resolved. usePlan() reads profiles.plan, so this is what the customer
        // actually experiences — it must not depend on the subscription
        // bookkeeping below succeeding.
        if (userId) {
          await db.from('profiles').update({ plan: planKey }).eq('id', userId);
        }

        const providerCustomerId      = String(data.customer_id ?? '');
        const providerSubscriptionId  = String(data.subscription_id ?? '');
        const periodStart = data.current_period_start ? new Date(data.current_period_start as string) : new Date();
        const periodEnd   = data.current_period_end   ? new Date(data.current_period_end as string)   : new Date(Date.now() + 30 * 86400000);

        // Upsert subscription
        const { data: existing } = shopId ? await db
          .from('shop_subscriptions')
          .select('id')
          .eq('shop_id', shopId)
          .maybeSingle() : { data: null };

        if (!shopId) {
          // Already logged above. The buyer has their plan; the subscription
          // row can be reconciled from billing_events, which holds the payload.
        } else if (existing?.id) {
          await db.from('shop_subscriptions').update({
            plan_key:                planKey,
            status:                  'active',
            provider_customer_id:    providerCustomerId,
            provider_subscription_id: providerSubscriptionId,
            current_period_start:    periodStart.toISOString(),
            current_period_end:      periodEnd.toISOString(),
            updated_at:              new Date().toISOString(),
          }).eq('id', existing.id);
        } else {
          await db.from('shop_subscriptions').insert({
            shop_id:                 shopId,
            plan_key:                planKey,
            status:                  'active',
            billing_provider:        'creem',
            provider_customer_id:    providerCustomerId,
            provider_subscription_id: providerSubscriptionId,
            current_period_start:    periodStart.toISOString(),
            current_period_end:      periodEnd.toISOString(),
          });
        }

      } else if (shopId && (eventType === 'subscription.cancelled' || eventType === 'subscription.canceled' || eventType === 'subscription.expired')) {
        await db.from('shop_subscriptions').update({
          status:       'cancelled',
          cancelled_at: new Date().toISOString(),
          updated_at:   new Date().toISOString(),
        }).eq('shop_id', shopId);

      } else if (shopId && (eventType === 'subscription.past_due' || eventType === 'subscription.unpaid')) {
        await db.from('shop_subscriptions').update({
          status:      'past_due',
          past_due_at: new Date().toISOString(),
          updated_at:  new Date().toISOString(),
        }).eq('shop_id', shopId);
      }

      if (eventRow?.id) {
        await db.from('billing_events').update({ processed: true, processed_at: new Date().toISOString() }).eq('id', eventRow.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[webhook/creem] subscription update failed:', msg);
      if (eventRow?.id) {
        await db.from('billing_events').update({ error: msg }).eq('id', eventRow.id);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[webhook/creem] unhandled error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
