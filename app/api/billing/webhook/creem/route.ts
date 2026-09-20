import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { alertBillingFailure, alertBillingException } from '@/lib/observability/billingAlerts';
import {
  ACTIVATION_EVENT_TYPES, CANCELLATION_EVENT_TYPES, PAST_DUE_EVENT_TYPES, UUID_RE,
  asId, classifyCreemEvent, eventMetadata, needsShop, parseEnvelope, unresolvedError,
  type CreemEventClass, type UnresolvedReason,
} from '@/lib/billing/creemEvent';
import { readSubscriptionPeriod } from '@/lib/billing/creemPeriod';

function getAdminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

type Db = ReturnType<typeof getAdminDb>;

/** Rows already recorded for this provider event id, oldest first. A failed lookup is logged and treated as "none". */
async function findEventRows(db: Db, providerEventId: string): Promise<Array<{ id: string; processed: boolean }>> {
  const { data, error } = await db
    .from('billing_events')
    .select('id, processed')
    .eq('provider_event_id', providerEventId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[webhook/creem] idempotency lookup failed:', error.message);
    return [];
  }
  return (data ?? []).map(r => ({ id: String(r.id), processed: !!r.processed }));
}

/** Record the outcome on the event's row. Logged, never thrown: bookkeeping must not turn a handled event into a retried one. */
async function markEvent(db: Db, id: string | null, state: { processed: boolean; error: string | null }): Promise<void> {
  if (!id) return;
  const { error } = await db
    .from('billing_events')
    .update({ processed: state.processed, processed_at: state.processed ? new Date().toISOString() : null, error: state.error })
    .eq('id', id);
  if (error) console.error('[webhook/creem] could not update the event record:', error.message);
}

/** The newest subscription row for a shop. Newest-first with limit 1, so duplicate rows can never make the lookup itself fail. */
async function latestSubscriptionRow(db: Db, shopId: string): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await db
    .from('shop_subscriptions')
    .select('id')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return { id: null, error: error.message };
  return { id: data && data.length ? String(data[0].id) : null, error: null };
}

type Resolution =
  | { kind: 'shop'; shopId: string }
  | { kind: 'unresolved'; reason: UnresolvedReason }
  | { kind: 'error'; message: string };

/**
 * Which shop does this event belong to? NEVER a guess.
 *  1. metadata.shop_id, and only if that shop exists;
 *  2. otherwise metadata.user_id, and only if that user belongs to EXACTLY ONE shop.
 * A user in several shops used to get whichever membership row came first, which could attach a payment to a
 * shop the buyer did not mean. That is now an unresolved event for the owner to look at.
 */
async function resolveShop(db: Db, meta: Record<string, string>): Promise<Resolution> {
  if (meta.shop_id) {
    if (!UUID_RE.test(meta.shop_id)) return { kind: 'unresolved', reason: 'shop_not_found' };
    const { data, error } = await db.from('shops').select('id').eq('id', meta.shop_id).limit(1);
    if (error) return { kind: 'error', message: `shop lookup failed: ${error.message}` };
    return data && data.length > 0
      ? { kind: 'shop', shopId: meta.shop_id }
      : { kind: 'unresolved', reason: 'shop_not_found' };
  }
  if (meta.user_id) {
    if (!UUID_RE.test(meta.user_id)) return { kind: 'unresolved', reason: 'no_membership' };
    const { data, error } = await db.from('shop_users').select('shop_id').eq('user_id', meta.user_id).limit(2);
    if (error) return { kind: 'error', message: `membership lookup failed: ${error.message}` };
    const shops = [...new Set((data ?? []).map(r => String(r.shop_id)))];
    if (shops.length === 1) {
      console.warn('[webhook/creem] metadata carried no shop_id; resolved it from the buyer\'s single shop membership.');
      return { kind: 'shop', shopId: shops[0] };
    }
    return { kind: 'unresolved', reason: shops.length === 0 ? 'no_membership' : 'ambiguous_membership' };
  }
  return { kind: 'unresolved', reason: 'no_shop_metadata' };
}

/**
 * A subscription event that must reach a shop but cannot. It is kept, visibly, and ACKNOWLEDGED.
 *
 *   processed = false, error = 'UNRESOLVED_SHOP:<reason>'
 *
 * That is exactly what the owner's Billing Health webhook view counts as failed, and the owner-only list at
 * /api/admin/billing-health/unresolved shows it with a masked reference, without the payload.
 *
 * Why 200 and not 5xx: nothing about the event changes on retry (its metadata is fixed), so a 5xx would only
 * make Creem redeliver the same unresolvable event, and every redelivery would be another alert. A 5xx is kept
 * for TRANSIENT failures (a database error), where retrying can help. If the cause is later fixed (for example
 * the buyer's membership is corrected) a redelivery re-evaluates the event, reuses this row, and clears it.
 * No access is granted to any shop, and no subscription row is written, while it is unresolved.
 */
async function holdUnresolved(
  db: Db,
  eventRowId: string | null,
  resolution: Resolution,
  context: { eventType: string; providerEventId: string; eventClass: CreemEventClass; hasUserId: boolean },
): Promise<NextResponse> {
  const reason: UnresolvedReason = resolution.kind === 'unresolved' ? resolution.reason : 'no_shop_metadata';
  await markEvent(db, eventRowId, { processed: false, error: unresolvedError(reason) });
  alertBillingFailure('cannot resolve a shop — subscription record NOT updated', { ...context, reason });
  return NextResponse.json({ received: true, unresolved: reason });
}

/** HMAC-SHA256 of the raw body, hex encoded. */
/**
 * Keep `profiles.billing_status` in step with the subscription.
 *
 * Deliberately does NOT touch `profiles.plan`. `plan` is what planGate reads
 * to decide access, and demoting it here would take a shop's data away the
 * moment a card bounced — before any dunning, and `past_due` often resolves
 * itself on a retry. Losing a month to a lapsed subscriber is a smaller
 * failure than locking a paying shop out of its own job cards, so that policy
 * is left alone and flagged rather than changed in passing.
 *
 * Failure is logged, never thrown. This runs AFTER the subscription row is
 * written, and a bookkeeping column must not turn a processed event into a
 * retried one — Creem would resend, and the customer's real state is already
 * correct in shop_subscriptions.
 */
async function syncBillingStatus(
  db: ReturnType<typeof getAdminDb>,
  userId: string | null,
  status: 'active' | 'cancelled' | 'past_due',
): Promise<void> {
  if (!userId) return;
  const { error } = await db.from('profiles').update({ billing_status: status }).eq('id', userId);
  if (error) console.error('[billing] profiles.billing_status sync failed:', status, error.message);
}

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
      alertBillingFailure('webhook signature did not verify — event rejected', {
        eventType, bodyBytes: rawBody.length,
      });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Creem's envelope is { id, eventType, created_at, object } — confirmed from a sandbox event on
    // 2026-08-02 (see lib/billing/creemEvent.ts). The other spellings are kept as fallbacks.
    const { eventType, providerEventId, data } = parseEnvelope(payload);
    const meta   = eventMetadata(data);
    const userId = meta.user_id || null;

    // CLASSIFY BEFORE REQUIRING A SHOP. Only an event that is (or looks like) a subscription needs a shop.
    // A one-time order from a payment link or the Creem dashboard carries no Redlined1 metadata and has no
    // shop to find; it is recorded and acknowledged, not reported as a failed subscription.
    const eventClass = classifyCreemEvent(eventType, data);

    const db = getAdminDb();

    // ── Idempotency ─────────────────────────────────────────────────────────────────────────────────
    // LIMITATION, stated plainly: this is a read-then-insert check made by the application. billing_events
    // has no unique index on provider_event_id, so two deliveries of the same event that overlap in time can
    // both pass the check and both insert. What this DOES guarantee is sequential behaviour: a redelivery of
    // an already-processed event is skipped, and a redelivery of an event that failed or was left unresolved
    // REUSES its row instead of adding another. True atomic idempotency needs a database unique constraint;
    // when one exists the insert below returns 23505 and the loser of the race is treated as a duplicate.
    // The proposed migration is documented in docs/billing-webhook-idempotency.md and is NOT part of this code.
    let eventRowId: string | null = null;
    if (providerEventId) {
      const known = await findEventRows(db, providerEventId);
      if (known.some(r => r.processed)) {
        return NextResponse.json({ received: true, skipped: 'duplicate' });
      }
      if (known.length > 0) eventRowId = known[0].id;
    }

    if (!eventRowId) {
      const { data: inserted, error: eventErr } = await db
        .from('billing_events')
        .insert({
          shop_id:           null,
          provider:          'creem',
          event_type:        eventType,
          provider_event_id: providerEventId,
          payload,
          processed:         false,
        })
        .select('id')
        .single();

      if (eventErr) {
        if (eventErr.code === '23505') {
          // A concurrent delivery of the same event won the unique index. It is being handled.
          return NextResponse.json({ received: true, skipped: 'duplicate' });
        }
        // Name the key class alongside the failure. "permission denied for table" is a GRANT error, and the
        // sb_secret_ restricted keys carry no grants on the billing tables. The value is never logged.
        const k = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
        const keyClass = !k ? 'missing'
          : k.startsWith('eyJ') ? 'legacy-service-role-jwt'
          : k.startsWith('sb_secret_') ? 'sb_secret-restricted'
          : 'unrecognised';
        alertBillingFailure('could not record the event', {
          reason: eventErr.message, serviceKeyClass: keyClass, eventType, providerEventId,
        });
      } else {
        eventRowId = (inserted as { id: string } | null)?.id ?? null;
      }
    }

    try {
      // ── Not a Redlined1 subscription's business: record and acknowledge. ──────────────────────────
      if (!needsShop(eventType, eventClass)) {
        await markEvent(db, eventRowId, { processed: true, error: null });
        return NextResponse.json({ received: true, classified: eventClass });
      }

      // ── Find the shop. Never guess. ───────────────────────────────────────────────────────────────
      const resolution = await resolveShop(db, meta);
      if (resolution.kind === 'error') {
        // A failed lookup is transient, not "unresolved": answer 5xx so Creem retries.
        throw new Error(resolution.message);
      }
      const shopId = resolution.kind === 'shop' ? resolution.shopId : null;
      if (shopId && eventRowId) {
        const { error: linkErr } = await db.from('billing_events').update({ shop_id: shopId }).eq('id', eventRowId);
        if (linkErr) console.error('[webhook/creem] could not link the event to its shop:', linkErr.message);
      }

      const isActivation = ACTIVATION_EVENT_TYPES.has(eventType);

      if (isActivation) {
        // `plan_id` is what createCheckoutSession has always sent; `plan_key` is what this handler was written
        // to read. Accept either, and only fall back to a default when neither is present.
        const planKey = meta.plan_key || meta.plan_id || 'professional';
        if (!meta.plan_key && !meta.plan_id) {
          console.warn('[webhook/creem] event carried no plan in metadata; defaulting to professional.');
        }

        // Unlock the app for the buyer that OUR checkout identified (metadata.user_id), even if the shop could
        // not be resolved: usePlan() reads profiles.plan. This never depends on a shop and never touches any
        // shop's subscription. The result is checked: supabase-js returns errors instead of throwing, and an
        // unchecked write once failed in complete silence while the endpoint answered 200.
        if (userId) {
          const { error, count } = await db
            .from('profiles')
            .update({ plan: planKey, billing_status: 'active' }, { count: 'exact' })
            .eq('id', userId);
          if (error) throw new Error(`profiles.plan update failed: ${error.message}`);
          if (count === 0) throw new Error(`profiles.plan update matched no row for user ${userId}`);
        }

        if (!shopId) return await holdUnresolved(db, eventRowId, resolution, { eventType, providerEventId, eventClass, hasUserId: !!userId });

        // Creem nests provider ids as objects. checkout.completed carries the subscription id nested; the
        // period comes from the provider's own fields (lib/billing/creemPeriod.ts), never from a guess.
        const providerCustomerId     = asId(data.customer) || asId(data.customer_id);
        const providerSubscriptionId = asId(data.subscription) || asId(data.subscription_id);
        const period = readSubscriptionPeriod(data);

        const existing = await latestSubscriptionRow(db, shopId);
        if (existing.error) throw new Error(`shop_subscriptions lookup failed: ${existing.error}`);

        // Only write what this event actually carries. A checkout.completed without a period, or a renewal
        // without a subscription id, must not erase a value an earlier event supplied.
        const changes = {
          plan_key:   planKey,
          status:     'active',
          updated_at: new Date().toISOString(),
          ...(providerCustomerId     ? { provider_customer_id:     providerCustomerId }     : {}),
          ...(providerSubscriptionId ? { provider_subscription_id: providerSubscriptionId } : {}),
          ...(period.start ? { current_period_start: period.start.toISOString() } : {}),
          ...(period.end   ? { current_period_end:   period.end.toISOString() }   : {}),
        };

        if (existing.id) {
          const { error } = await db.from('shop_subscriptions').update(changes).eq('id', existing.id);
          if (error) throw new Error(`shop_subscriptions update failed: ${error.message}`);
        } else {
          const { error } = await db.from('shop_subscriptions').insert({
            shop_id:                  shopId,
            billing_provider:         'creem',
            provider_customer_id:     providerCustomerId,
            provider_subscription_id: providerSubscriptionId,
            ...changes,
            // Unknown stays unknown (the columns are nullable). Never a guessed date.
            current_period_start: period.start ? period.start.toISOString() : null,
            current_period_end:   period.end   ? period.end.toISOString()   : null,
          });
          if (error && error.code === '23505') {
            // A concurrent event created this shop's row first (possible once shop_id is unique). Apply this
            // event to that row instead.
            const raced = await latestSubscriptionRow(db, shopId);
            if (!raced.id) throw new Error('shop_subscriptions insert conflicted but no row was found');
            const { error: upErr } = await db.from('shop_subscriptions').update(changes).eq('id', raced.id);
            if (upErr) throw new Error(`shop_subscriptions update failed: ${upErr.message}`);
          } else if (error) {
            throw new Error(`shop_subscriptions insert failed: ${error.message}`);
          }
        }

      } else if (CANCELLATION_EVENT_TYPES.has(eventType)) {
        if (!shopId) return await holdUnresolved(db, eventRowId, resolution, { eventType, providerEventId, eventClass, hasUserId: !!userId });
        const { error } = await db.from('shop_subscriptions').update({
          status:       'cancelled',
          cancelled_at: new Date().toISOString(),
          updated_at:   new Date().toISOString(),
        }).eq('shop_id', shopId);
        if (error) throw new Error(`cancellation update failed: ${error.message}`);
        await syncBillingStatus(db, userId, 'cancelled');

      } else if (PAST_DUE_EVENT_TYPES.has(eventType)) {
        if (!shopId) return await holdUnresolved(db, eventRowId, resolution, { eventType, providerEventId, eventClass, hasUserId: !!userId });
        const { error } = await db.from('shop_subscriptions').update({
          status:      'past_due',
          past_due_at: new Date().toISOString(),
          updated_at:  new Date().toISOString(),
        }).eq('shop_id', shopId);
        if (error) throw new Error(`past_due update failed: ${error.message}`);
        await syncBillingStatus(db, userId, 'past_due');
      }

      await markEvent(db, eventRowId, { processed: true, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // The customer has been charged and has not received their plan. This is the single most important
      // alert in the system.
      alertBillingException(err, { stage: 'activation', eventType, providerEventId, eventClass });
      await markEvent(db, eventRowId, { processed: false, error: msg });
      // Answer non-2xx so Creem retries. The retry REUSES this event's row (see above), so it does not add a
      // second one, and every write above is safe to repeat.
      return NextResponse.json({ error: 'Activation failed', detail: msg }, { status: 500 });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[webhook/creem] unhandled error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
