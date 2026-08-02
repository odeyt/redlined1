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

/**
 * Diagnostic only — runs when verification has ALREADY failed, and never
 * grants access. Creem's docs specify HMAC-SHA256 hex over the raw body, and
 * the received signature is 64 hex characters, so the scheme is right and the
 * disagreement is in how the key is derived from the displayed secret.
 * Providers differ on whether the human-readable prefix is part of the key.
 *
 * This reports WHICH derivation matches so the correct one can be pinned,
 * rather than broadening what the endpoint accepts — accepting several schemes
 * would mean a weaker one stays reachable forever.
 */
async function identifySigningScheme(rawBody: string, received: string): Promise<string | null> {
  const secret = process.env.CREEM_WEBHOOK_SECRET ?? '';
  const stripped = secret.replace(/^whsec_/, '');

  const candidates: Array<[string, Uint8Array]> = [
    ['secret-as-shown', new TextEncoder().encode(secret)],
    ['secret-without-whsec-prefix', new TextEncoder().encode(stripped)],
  ];

  // Some providers display a base64 or hex encoding of the raw key bytes.
  try {
    candidates.push(['base64-decoded-secret', Uint8Array.from(atob(stripped), c => c.charCodeAt(0))]);
  } catch { /* not valid base64 */ }
  if (/^[0-9a-f]+$/i.test(stripped) && stripped.length % 2 === 0) {
    candidates.push(['hex-decoded-secret',
      Uint8Array.from(stripped.match(/../g)!.map(h => parseInt(h, 16)))]);
  }

  for (const [name, keyBytes] of candidates) {
    try {
      const key = await crypto.subtle.importKey(
        'raw', keyBytes as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
      );
      const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
      const bytes = new Uint8Array(mac);
      const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const b64 = btoa(String.fromCharCode(...bytes));
      if (hex === received) return `${name} / hex`;
      if (b64 === received) return `${name} / base64`;
    } catch { /* try the next candidate */ }
  }
  return null;
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
    // Trimmed: a trailing newline changes the HMAC key entirely, and the
    // resulting failure is indistinguishable from a wrong secret or a
    // different signing scheme.
    const secret = process.env.CREEM_WEBHOOK_SECRET?.trim();

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
      let payloadKeys: string[] = [];
      try {
        const parsed = JSON.parse(rawBody) as Record<string, unknown>;
        eventType = String(parsed.type ?? '(none)');
        // Field NAMES only, never values — the shape is what is needed to read
        // the event correctly, and the values carry customer data.
        payloadKeys = Object.keys(parsed);
      } catch { /* keep placeholder */ }
      console.error('[webhook/creem] REJECTED — signature did not verify.', JSON.stringify({
        eventType,
        bodyBytes: rawBody.length,
        signatureHeaders: [...req.headers.keys()].filter(h => /sign|hmac|digest/i.test(h)),
        payloadKeys,
        received: signature.slice(0, 96),
        expectedHmacSha256Hex: (await hmacHex(rawBody, secret)).slice(0, 96),
        matchingScheme: await identifySigningScheme(rawBody, signature.replace(/^sha256=/, '')),
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

    // Creem's envelope is { id, eventType, created_at, object } — confirmed from
    // a sandbox event on 2026-08-02. This handler was written against `type`
    // and `data`, which no Creem event carries, so every event would have been
    // treated as an unknown type and silently ignored even once signatures
    // verified. The other spellings are kept as fallbacks and cost nothing.
    const eventType       = String(payload.eventType ?? payload.type ?? payload.event_type ?? '');
    const providerEventId = String(payload.id ?? payload.event_id ?? '');
    const data            = (payload.object ?? payload.data ?? payload) as Record<string, unknown>;
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
    const { data: eventRow, error: eventErr } = await db
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

    if (eventErr) {
      console.error('[webhook/creem] could not record the event:', eventErr.message);
    }

    // Handle subscription updates
    try {
      // `subscription.paid` fires on every successful charge, including
      // renewals — Creem sent one alongside checkout.completed in the sandbox.
      // Without it a subscription activates on purchase and then never renews:
      // current_period_end goes stale and the customer eventually looks lapsed
      // despite paying every month.
      const isActivation =
        eventType === 'checkout.completed' ||
        eventType === 'subscription.created' ||
        eventType === 'subscription.active' ||
        eventType === 'subscription.paid';

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
        //
        // The result is checked. supabase-js returns errors instead of
        // throwing, so an unchecked write fails in complete silence: a
        // restricted API key made every write here fail while the endpoint
        // still answered 200, and Creem — correctly — never retried. The
        // customer was charged, the logs were clean, and nothing happened.
        if (userId) {
          const { error, count } = await db
            .from('profiles')
            .update({ plan: planKey }, { count: 'exact' })
            .eq('id', userId);
          if (error) throw new Error(`profiles.plan update failed: ${error.message}`);
          // Zero rows matched is not an error to PostgREST, but it means the
          // customer is still on their old plan.
          if (count === 0) throw new Error(`profiles.plan update matched no row for user ${userId}`);
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
          const { error } = await db.from('shop_subscriptions').update({
            plan_key:                planKey,
            status:                  'active',
            provider_customer_id:    providerCustomerId,
            provider_subscription_id: providerSubscriptionId,
            current_period_start:    periodStart.toISOString(),
            current_period_end:      periodEnd.toISOString(),
            updated_at:              new Date().toISOString(),
          }).eq('id', existing.id);
          if (error) throw new Error(`shop_subscriptions update failed: ${error.message}`);
        } else {
          const { error } = await db.from('shop_subscriptions').insert({
            shop_id:                 shopId,
            plan_key:                planKey,
            status:                  'active',
            billing_provider:        'creem',
            provider_customer_id:    providerCustomerId,
            provider_subscription_id: providerSubscriptionId,
            current_period_start:    periodStart.toISOString(),
            current_period_end:      periodEnd.toISOString(),
          });
          if (error) throw new Error(`shop_subscriptions insert failed: ${error.message}`);
        }

      } else if (shopId && (eventType === 'subscription.cancelled' || eventType === 'subscription.canceled' || eventType === 'subscription.expired')) {
        const { error } = await db.from('shop_subscriptions').update({
          status:       'cancelled',
          cancelled_at: new Date().toISOString(),
          updated_at:   new Date().toISOString(),
        }).eq('shop_id', shopId);
        if (error) throw new Error(`cancellation update failed: ${error.message}`);

      } else if (shopId && (eventType === 'subscription.past_due' || eventType === 'subscription.unpaid')) {
        const { error } = await db.from('shop_subscriptions').update({
          status:      'past_due',
          past_due_at: new Date().toISOString(),
          updated_at:  new Date().toISOString(),
        }).eq('shop_id', shopId);
        if (error) throw new Error(`past_due update failed: ${error.message}`);
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
      // Answer non-2xx so Creem retries. This previously returned 200 on
      // failure, which told Creem the event was handled and permanently
      // discarded the only automatic chance to recover — the customer had paid
      // and the sole record of it was a log line.
      return NextResponse.json({ error: 'Activation failed', detail: msg }, { status: 500 });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[webhook/creem] unhandled error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
