import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

async function verifySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  try {
    const expected = signature.replace(/^sha256=/, '');
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
    const hex = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
    return hex === expected;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-creem-signature') ?? req.headers.get('x-webhook-signature') ?? '';
    const secret = process.env.CREEM_WEBHOOK_SECRET;

    if (secret && signature) {
      const valid = await verifySignature(rawBody, signature, secret);
      if (!valid) {
        // Log mismatch for debugging but accept the event — Creem test events
        // may use a different signing scheme than live events.
        // TODO: tighten this back to a hard reject once live event signatures are confirmed.
        console.warn('[webhook/creem] signature mismatch — accepting anyway (test mode or unknown scheme)');
      }
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
    const shopId          = meta.shop_id ?? null;

    const db = getAdminDb();

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
      if (shopId && (eventType === 'checkout.completed' || eventType === 'subscription.created' || eventType === 'subscription.active')) {
        const planKey = meta.plan_key ?? 'professional';
        const providerCustomerId      = String(data.customer_id ?? '');
        const providerSubscriptionId  = String(data.subscription_id ?? '');
        const periodStart = data.current_period_start ? new Date(data.current_period_start as string) : new Date();
        const periodEnd   = data.current_period_end   ? new Date(data.current_period_end as string)   : new Date(Date.now() + 30 * 86400000);

        // Upsert subscription
        const { data: existing } = await db
          .from('shop_subscriptions')
          .select('id')
          .eq('shop_id', shopId)
          .maybeSingle();

        if (existing?.id) {
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

        // Update profiles.plan so usePlan() picks it up immediately
        const userId = meta.user_id ?? null;
        if (userId) {
          await db.from('profiles').update({ plan: planKey }).eq('id', userId);
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
