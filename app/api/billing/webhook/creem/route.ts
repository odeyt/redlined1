import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { alertBillingFailure, alertBillingException } from '@/lib/observability/billingAlerts';
import {
  ACTIVATION_EVENT_TYPES, BILLING_ELIGIBLE_ROLES, CANCELLATION_EVENT_TYPES, PAST_DUE_EVENT_TYPES, SUSPENSION_EVENT_TYPES, UUID_RE,
  asId, decideCreemEvent, parseEnvelope, resolveEventMetadata, unresolvedError,
  type CreemEventClass, type UnresolvedReason,
} from '@/lib/billing/creemEvent';
import { readSubscriptionPeriod } from '@/lib/billing/creemPeriod';
import { resolvePlan } from '@/lib/billing/creemPlan';
import {
  authoritativeStateEnabled, fetchAuthoritativeSubscription, type AuthoritativeState,
} from '@/lib/billing/creemAuthoritative';

function getAdminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

type Db = ReturnType<typeof getAdminDb>;

/**
 * Rows already recorded for this provider event id, oldest first. A failed lookup is logged and treated as "none".
 *
 * Filtered on (provider, provider_event_id) — the SAME pair as the proposed unique index. The lookup used to
 * filter on provider_event_id alone, so the query and the constraint disagreed about what identifies an event:
 * the index would have allowed two providers to share an id while the lookup returned both rows. Only 'creem'
 * exists today, which is exactly why this is cheap to fix now.
 */
async function findEventRows(db: Db, providerEventId: string): Promise<Array<{ id: string; processed: boolean }>> {
  const { data, error } = await db
    .from('billing_events')
    .select('id, processed')
    .eq('provider', 'creem')
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
async function latestSubscriptionRow(
  db: Db,
  shopId: string,
): Promise<{ id: string | null; providerSubscriptionId: string; error: string | null }> {
  const { data, error } = await db
    .from('shop_subscriptions')
    .select('id, provider_subscription_id')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return { id: null, providerSubscriptionId: '', error: error.message };
  const row = data && data.length ? data[0] : null;
  return {
    id: row ? String(row.id) : null,
    providerSubscriptionId: row && row.provider_subscription_id ? String(row.provider_subscription_id) : '',
    error: null,
  };
}

type Resolution =
  | { kind: 'shop'; shopId: string }
  | { kind: 'unresolved'; reason: UnresolvedReason }
  | { kind: 'error'; message: string };

/**
 * Which shop does this event belong to, and did its buyer really have the right to buy for it? NEVER a guess, and
 * nothing is changed until this says yes.
 *
 * `meta` is the event's single coherent metadata source (see resolveEventMetadata). Its `user_id` is the buyer our
 * own checkout authenticated when it created the session: the checkout reads the session, the provider only carries
 * the value back, and the webhook signature proves the carrier. It is trusted only as far as it can be checked here:
 *   - it must be a valid id, and present. A shop id with no buyer is not enough to grant anything;
 *   - with a shop_id: the shop must exist, and the buyer must be a member of THAT shop in an eligible role
 *     (owner or manager). An unrelated user, or a technician or advisor, is refused;
 *   - with no shop_id: only a buyer with exactly ONE membership in total, and only if it is eligible. A buyer in
 *     several shops is never assigned one of them.
 */
async function resolveBuyerShop(db: Db, meta: Record<string, string>): Promise<Resolution> {
  if (!meta.user_id) {
    return { kind: 'unresolved', reason: meta.shop_id ? 'buyer_unverified' : 'no_shop_metadata' };
  }
  if (!UUID_RE.test(meta.user_id)) return { kind: 'unresolved', reason: 'buyer_unverified' };

  if (meta.shop_id) {
    if (!UUID_RE.test(meta.shop_id)) return { kind: 'unresolved', reason: 'shop_not_found' };
    const shop = await db.from('shops').select('id').eq('id', meta.shop_id).limit(1);
    if (shop.error) return { kind: 'error', message: `shop lookup failed: ${shop.error.message}` };
    if (!shop.data || shop.data.length === 0) return { kind: 'unresolved', reason: 'shop_not_found' };

    const member = await db.from('shop_users').select('role').eq('user_id', meta.user_id).eq('shop_id', meta.shop_id).limit(5);
    if (member.error) return { kind: 'error', message: `membership lookup failed: ${member.error.message}` };
    const roles = (member.data ?? []).map(r => String(r.role ?? ''));
    if (roles.length === 0) return { kind: 'unresolved', reason: 'buyer_not_member' };
    // Every membership row for this pair must be eligible; a stray technician row next to an owner row is refused.
    if (!roles.every(r => BILLING_ELIGIBLE_ROLES.has(r))) return { kind: 'unresolved', reason: 'buyer_not_eligible' };
    return { kind: 'shop', shopId: meta.shop_id };
  }

  const memberships = await db.from('shop_users').select('shop_id, role').eq('user_id', meta.user_id).limit(5);
  if (memberships.error) return { kind: 'error', message: `membership lookup failed: ${memberships.error.message}` };
  const rows = memberships.data ?? [];
  const shops = [...new Set(rows.map(r => String(r.shop_id)))];
  if (shops.length === 0) return { kind: 'unresolved', reason: 'no_membership' };
  if (shops.length > 1) return { kind: 'unresolved', reason: 'ambiguous_membership' };
  if (!rows.every(r => BILLING_ELIGIBLE_ROLES.has(String(r.role ?? '')))) return { kind: 'unresolved', reason: 'buyer_not_eligible' };
  console.warn('[webhook/creem] metadata carried no shop_id; resolved it from the buyer\'s single eligible shop membership.');
  return { kind: 'shop', shopId: shops[0] };
}

/**
 * An event that must not be applied, kept visibly and ACKNOWLEDGED.
 *
 *   processed = false, error = 'UNRESOLVED:<reason>'
 *
 * That is exactly what the owner's Billing Health webhook view counts as failed, and the owner-only list at
 * /api/admin/billing-health/unresolved shows it with a masked reference, without the payload.
 *
 * Why 200 and not 5xx: nothing about the event changes on retry (its bytes are fixed), so a 5xx would only make
 * Creem redeliver the same event for 24 hours, and every redelivery would be another alert. A 5xx is kept for
 * TRANSIENT failures (a database error), where retrying can help. If the cause is later fixed (for example the
 * buyer's role is corrected) a redelivery re-evaluates the event, reuses this row, and clears it. While an event
 * is held NOTHING is changed: no profile plan, no subscription row, no billing status.
 */
async function holdEvent(
  db: Db,
  eventRowId: string | null,
  reason: UnresolvedReason,
  context: { eventType: string; providerEventId: string; eventClass: CreemEventClass },
  /** Diagnostic only. It reaches the alert, never the stored error: that vocabulary is fixed on purpose. */
  detail?: string,
): Promise<NextResponse> {
  await markEvent(db, eventRowId, { processed: false, error: unresolvedError(reason) });
  alertBillingFailure('event held — nothing was applied', { ...context, reason, ...(detail ? { detail } : {}) });
  return NextResponse.json({ received: true, unresolved: reason });
}

/**
 * The period only ever moves FORWARD. Each statement is one conditional UPDATE, so the rule is enforced by the
 * database and not by a read the application made a moment earlier: a late event, a retry, or a redelivery after a
 * newer renewal cannot lower a stored period end, even when it overlaps another request.
 *
 * Two statements because a NULL end (never set) and an older end are different conditions; they are mutually
 * exclusive, so at most one of them changes anything. An equal end changes nothing.
 *
 * This decides ONLY the two period columns. It is not used to decide plan or status: a date alone cannot tell a
 * late event from a current one (see docs/billing-webhook-idempotency.md, "Ordering").
 */
async function advancePeriod(db: Db, rowId: string, period: { start: Date | null; end: Date | null }): Promise<void> {
  if (!period.end) return;
  const values = {
    current_period_end: period.end.toISOString(),
    ...(period.start ? { current_period_start: period.start.toISOString() } : {}),
  };
  const unset = await db.from('shop_subscriptions').update(values).eq('id', rowId).is('current_period_end', null);
  if (unset.error) throw new Error(`shop_subscriptions period update failed: ${unset.error.message}`);
  const newer = await db.from('shop_subscriptions').update(values).eq('id', rowId).lt('current_period_end', values.current_period_end);
  if (newer.error) throw new Error(`shop_subscriptions period update failed: ${newer.error.message}`);
}

/**
 * Which subscription should this event be reconciled against?
 *
 * Not every lifecycle event carries a subscription id — some checkout.completed shapes do not. Falling through
 * to the event-derived path there would quietly reopen the ordering hole Option B exists to close, and holding
 * every such event would block a legitimate first purchase, which is the worse failure of the two.
 *
 *   from the event    the normal case
 *   from the shop     the event names none, but this shop already has a subscription to reconcile against
 *   first activation  nothing names a provider subscription AND the event grants rather than revokes. There is
 *                     no PROVIDER state to overwrite, so the ordering hazard cannot apply, and the event-derived
 *                     path is the only way a first purchase can activate
 *   unidentified      nothing names a provider subscription and the event would REVOKE. Held, and RECOVERABLE:
 *                     once any later event stores an id, a redelivery of this one resolves
 *
 * A row with no provider_subscription_id is a LOCAL PLACEHOLDER, not provider state. commercial/subscriptions/
 * subscriptionService.ts createTrialSubscription() inserts exactly that — shop_id, plan_key, status 'trialing',
 * trial dates, and no provider columns — for a trial nobody paid for. Counting it as prior state would hold
 * every subsequent purchase for a shop that had been given a trial, which is a paying customer blocked by a row
 * their own signup created. It carries no provider subscription, so there is nothing a stale event could
 * contradict, and the first proven purchase claims it.
 */
type SubscriptionTarget =
  | { kind: 'id'; id: string; source: 'event' | 'stored' }
  | { kind: 'first_activation' }
  | { kind: 'unidentified' };

async function resolveSubscriptionTarget(
  db: Db,
  shopId: string,
  data: Record<string, unknown>,
  isActivation: boolean,
): Promise<SubscriptionTarget | { kind: 'error'; message: string }> {
  const fromEvent = asId(data.subscription) || asId(data.subscription_id);
  if (fromEvent) return { kind: 'id', id: fromEvent, source: 'event' };

  const existing = await latestSubscriptionRow(db, shopId);
  if (existing.error) return { kind: 'error', message: `shop_subscriptions lookup failed: ${existing.error}` };

  if (existing.providerSubscriptionId) {
    return { kind: 'id', id: existing.providerSubscriptionId, source: 'stored' };
  }
  // Past here nothing names a provider subscription: no row, or a placeholder row carrying no provider id.
  // Granting is safe (nothing to undo); revoking is not (there is nothing identified to revoke).
  if (isActivation) return { kind: 'first_activation' };
  return { kind: 'unidentified' };
}

/**
 * OPTION B write path: store exactly what the provider says, and nothing the event says.
 *
 * Mirrors the event-derived writes deliberately — same tables, same order, same forward-only period — so the two
 * paths cannot drift in what they produce, only in where the values came from. profiles.plan is still never
 * downgraded here; that policy lives in syncBillingStatus and is unchanged.
 */
async function applyAuthoritativeState(
  db: Db,
  args: {
    shopId: string;
    userId: string;
    eventRowId: string | null;
    state: AuthoritativeState;
    held: { eventType: string; providerEventId: string; eventClass: CreemEventClass };
  },
): Promise<NextResponse> {
  const { shopId, userId, eventRowId, state, held } = args;

  if (state.status === 'active' || state.status === 'suspended') {
    // active GRANTS the provider's plan. suspended REMOVES paid access — profiles.plan is the one field planGate
    // reads — while the purchased plan stays on the subscription row (plan_key below), with its ids and period.
    const entitlement = state.status === 'active'
      ? { plan: state.planKey, billing_status: 'active' }
      : { plan: 'free',        billing_status: 'suspended' };
    const { error: profileErr, count } = await db
      .from('profiles')
      .update(entitlement, { count: 'exact' })
      .eq('id', userId);
    if (profileErr) throw new Error(`profiles.plan update failed: ${profileErr.message}`);
    if (count === 0) return await holdEvent(db, eventRowId, 'no_buyer_profile', held);
  }

  const nowIso = new Date().toISOString();

  // The lifecycle columns are DERIVED from the one status, never accumulated. A row that says active must not
  // still carry a cancellation date, and vice versa. The date itself is the provider's own `canceled_at`, so it
  // belongs to the same subscription as the id beside it.
  const changes: Record<string, unknown> = {
    status:                   state.status,
    plan_key:                 state.planKey,
    billing_provider:         'creem',
    provider_subscription_id: state.subscriptionId,
    updated_at:               nowIso,
    cancelled_at: state.status === 'cancelled' ? (state.canceledAt?.toISOString() ?? nowIso) : null,
    past_due_at:  state.status === 'past_due'  ? nowIso : null,
    ...(state.providerCustomerId ? { provider_customer_id: state.providerCustomerId } : {}),
  };

  const existing = await latestSubscriptionRow(db, shopId);
  if (existing.error) throw new Error(`shop_subscriptions lookup failed: ${existing.error}`);

  if (existing.id) {
    // A DIFFERENT subscription replaces the period outright; the same one may only move it forward.
    //
    // advancePeriod's forward-only rule guards against a late or duplicated event for ONE subscription. Applied
    // across a resubscription it produces an incoherent row: SUB_2's id sitting on SUB_1's period, because a new
    // subscription bought mid-period ends earlier than the old one. A different id is a different object, and its
    // period is simply authoritative for it.
    const sameSubscription = existing.providerSubscriptionId === state.subscriptionId;

    const { error } = await db.from('shop_subscriptions').update(
      sameSubscription ? changes : {
        ...changes,
        current_period_start: state.period.start ? state.period.start.toISOString() : null,
        current_period_end:   state.period.end   ? state.period.end.toISOString()   : null,
      },
    ).eq('id', existing.id);
    if (error) throw new Error(`shop_subscriptions update failed: ${error.message}`);
    if (sameSubscription) await advancePeriod(db, existing.id, state.period);
  } else {
    const { error } = await db.from('shop_subscriptions').insert({
      shop_id:              shopId,
      ...changes,
      current_period_start: state.period.start ? state.period.start.toISOString() : null,
      current_period_end:   state.period.end   ? state.period.end.toISOString()   : null,
    });
    if (error && error.code === '23505') {
      const raced = await latestSubscriptionRow(db, shopId);
      if (!raced.id) throw new Error('shop_subscriptions insert conflicted but no row was found');
      const sameSubscription = raced.providerSubscriptionId === state.subscriptionId;
      const { error: upErr } = await db.from('shop_subscriptions').update(
        sameSubscription ? changes : {
          ...changes,
          current_period_start: state.period.start ? state.period.start.toISOString() : null,
          current_period_end:   state.period.end   ? state.period.end.toISOString()   : null,
        },
      ).eq('id', raced.id);
      if (upErr) throw new Error(`shop_subscriptions update failed: ${upErr.message}`);
      if (sameSubscription) await advancePeriod(db, raced.id, state.period);
    } else if (error) {
      throw new Error(`shop_subscriptions insert failed: ${error.message}`);
    }
  }

  // A suspension already wrote billing_status with the entitlement above.
  if (state.status !== 'suspended') {
    await syncBillingStatus(db, userId, state.status === 'cancelled' ? 'cancelled' : state.status === 'past_due' ? 'past_due' : 'active');
  }
  await markEvent(db, eventRowId, { processed: true, error: null });
  return NextResponse.json({ received: true, applied: 'provider_state', status: state.status });
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
        // The EXPECTED signature is deliberately not logged. It is the valid HMAC of a body the sender chose, so
        // anyone who could read this log could resubmit that body with it and have a forged event accepted —
        // log access would become the ability to grant a paid plan. matchingScheme below still diagnoses a
        // format mismatch (hex / base64 / key encoding) without revealing any value.
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
    const envelope = parseEnvelope(payload);
    const { eventType, providerEventId, data } = envelope;

    // DECIDE BEFORE TOUCHING A SHOP: apply it, quietly acknowledge it (only a positively identified external
    // one-time order), or hold it. Missing type or id, a malformed checkout, refunds, and subscription events this
    // code does not handle are all held, explicitly and visibly (see lib/billing/creemEvent.ts).
    const decision = decideCreemEvent(envelope);
    const eventClass = decision.eventClass;

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
          provider_event_id: providerEventId || null,
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
      const held = { eventType, providerEventId, eventClass };

      // ── Not applied: a positively identified external order is acknowledged quietly; everything else is held ─
      if (decision.action === 'acknowledge') {
        await markEvent(db, eventRowId, { processed: true, error: null });
        return NextResponse.json({ received: true, classified: decision.eventClass });
      }
      if (decision.action === 'hold') return await holdEvent(db, eventRowId, decision.reason, held);

      // ── From here the event is a subscription lifecycle event. Prove it before changing anything. ─────────────
      // 1. ONE metadata source. Two places that disagree are a conflict, never a merge.
      const metadata = resolveEventMetadata(data);
      if (metadata.kind === 'conflict') return await holdEvent(db, eventRowId, 'conflicting_metadata', held);
      const meta = metadata.kind === 'ok' ? metadata.meta : {};

      // 2. The shop, and that the buyer our checkout authenticated is an eligible member of it. A lookup that fails
      //    is transient, not "unresolved": answer 5xx so Creem retries.
      const resolution = await resolveBuyerShop(db, meta);
      if (resolution.kind === 'error') throw new Error(resolution.message);
      if (resolution.kind === 'unresolved') return await holdEvent(db, eventRowId, resolution.reason, held);
      const shopId = resolution.shopId;
      const userId = meta.user_id;   // verified above: a valid id that is an eligible member of shopId
      if (eventRowId) {
        const { error: linkErr } = await db.from('billing_events').update({ shop_id: shopId }).eq('id', eventRowId);
        if (linkErr) console.error('[webhook/creem] could not link the event to its shop:', linkErr.message);
      }

      // ── OPTION B, behind BILLING_AUTHORITATIVE_STATE (default off) ───────────────────────────────────────
      // Ask the provider what the subscription IS, and apply that instead of what this event says. The outcome
      // stops depending on arrival order: a late activation cannot reactivate a subscription Creem considers
      // cancelled, and a stale plan cannot be written back. With the flag off, every line below this block is
      // byte-for-byte the behaviour that shipped.
      //
      // An event with no subscription id is reconciled against the shop's stored subscription instead; only a
      // genuine first activation falls through to the event-derived path (see resolveSubscriptionTarget).
      if (authoritativeStateEnabled()) {
        const target = await resolveSubscriptionTarget(db, shopId, data, ACTIVATION_EVENT_TYPES.has(eventType));
        if (target.kind === 'error') throw new Error(target.message);
        if (target.kind === 'unidentified') {
          return await holdEvent(db, eventRowId, 'subscription_unidentified', held);
        }
        if (target.kind === 'id') {
          const result = await fetchAuthoritativeSubscription(target.id);
          // Fail closed, transient: nothing is applied and Creem redelivers into the SAME event row. The shop
          // keeps working throughout — only this billing event waits.
          if (result.kind === 'unavailable') throw new Error(`provider state unavailable: ${result.detail}`);
          // Fail closed, permanent for these bytes: hold it where the owner can see it. 200, because a
          // redelivery of an unchanged event cannot produce a different answer.
          if (result.kind === 'unusable') {
            return await holdEvent(db, eventRowId, 'provider_state_unusable', held, result.detail);
          }
          // The subscription Creem returned must belong to the shop this event was proved against. Without this
          // check a subscription id on an event — or a stale id stored on the row — could apply another shop's
          // subscription here, and a placeholder row would be claimed by something nobody bought for it.
          if (result.state.metadataShopId && result.state.metadataShopId !== shopId) {
            return await holdEvent(db, eventRowId, 'conflicting_metadata', held,
              'the provider subscription belongs to a different shop');
          }
          return await applyAuthoritativeState(db, {
            shopId, userId, eventRowId, state: result.state, held,
          });
        }
        // target.kind === 'first_activation': fall through and apply what the event carries.
      }

      if (ACTIVATION_EVENT_TYPES.has(eventType)) {
        // 3. The plan. Never defaulted: missing, unknown or contradictory is held, not "Professional".
        const plan = resolvePlan(meta, data);
        if (plan.kind === 'unresolved') return await holdEvent(db, eventRowId, plan.reason, held);
        const planKey = plan.planKey;

        // 4. Only now is anything written. Unlock the app for the verified buyer: usePlan() reads profiles.plan.
        //    The result is checked: supabase-js returns errors instead of throwing, and an unchecked write once
        //    failed in complete silence while the endpoint answered 200. A buyer with no profile row is permanent
        //    (a retry cannot create one), so it is held rather than retried.
        const { error: profileErr, count } = await db
          .from('profiles')
          .update({ plan: planKey, billing_status: 'active' }, { count: 'exact' })
          .eq('id', userId);
        if (profileErr) throw new Error(`profiles.plan update failed: ${profileErr.message}`);
        if (count === 0) return await holdEvent(db, eventRowId, 'no_buyer_profile', held);

        // Creem nests provider ids as objects. checkout.completed carries the subscription id nested; the
        // period comes from the provider's own fields (lib/billing/creemPeriod.ts), never from a guess.
        const providerCustomerId     = asId(data.customer) || asId(data.customer_id);
        const providerSubscriptionId = asId(data.subscription) || asId(data.subscription_id);
        const period = readSubscriptionPeriod(data);

        const existing = await latestSubscriptionRow(db, shopId);
        if (existing.error) throw new Error(`shop_subscriptions lookup failed: ${existing.error}`);

        // Only write what this event actually carries. A checkout.completed without a period, or a renewal
        // without a subscription id, must not erase a value an earlier event supplied. The period is NOT in this
        // set: it goes through advancePeriod, which can only move it forward.
        const changes = {
          plan_key:   planKey,
          status:     'active',
          updated_at: new Date().toISOString(),
          ...(providerCustomerId     ? { provider_customer_id:     providerCustomerId }     : {}),
          ...(providerSubscriptionId ? { provider_subscription_id: providerSubscriptionId } : {}),
        };

        if (existing.id) {
          const { error } = await db.from('shop_subscriptions').update(changes).eq('id', existing.id);
          if (error) throw new Error(`shop_subscriptions update failed: ${error.message}`);
          await advancePeriod(db, existing.id, period);
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
            // event to that row instead, moving the period forward only.
            const raced = await latestSubscriptionRow(db, shopId);
            if (!raced.id) throw new Error('shop_subscriptions insert conflicted but no row was found');
            const { error: upErr } = await db.from('shop_subscriptions').update(changes).eq('id', raced.id);
            if (upErr) throw new Error(`shop_subscriptions update failed: ${upErr.message}`);
            await advancePeriod(db, raced.id, period);
          } else if (error) {
            throw new Error(`shop_subscriptions insert failed: ${error.message}`);
          }
        }

      } else if (CANCELLATION_EVENT_TYPES.has(eventType)) {
        const { error } = await db.from('shop_subscriptions').update({
          status:       'cancelled',
          cancelled_at: new Date().toISOString(),
          updated_at:   new Date().toISOString(),
        }).eq('shop_id', shopId);
        if (error) throw new Error(`cancellation update failed: ${error.message}`);
        await syncBillingStatus(db, userId, 'cancelled');

      } else if (PAST_DUE_EVENT_TYPES.has(eventType)) {
        const { error } = await db.from('shop_subscriptions').update({
          status:      'past_due',
          past_due_at: new Date().toISOString(),
          updated_at:  new Date().toISOString(),
        }).eq('shop_id', shopId);
        if (error) throw new Error(`past_due update failed: ${error.message}`);
        await syncBillingStatus(db, userId, 'past_due');

      } else if (SUSPENSION_EVENT_TYPES.has(eventType)) {
        // Approved rule: paused -> suspended. A TEMPORARY loss of paid access, not a cancellation.
        //
        // Applied only to the subscription the shop actually has. A pause for a different subscription — an old
        // one, delivered after the customer resubscribed — must not remove access the current one paid for. A
        // pause that names none, or a shop whose row names none, cannot be matched at all. Both are held.
        //
        // No plan is resolved or written here: suspending needs no plan, and inventing one to write would be
        // exactly the fabrication this handler refuses. The purchased plan, the provider ids and the period stay
        // on the row as they are; only status changes. Access returns with an ordinary activation, whose plan
        // comes from the product.
        const eventSubscriptionId = asId(data.subscription) || asId(data.subscription_id) || asId(data.id);
        const row = await latestSubscriptionRow(db, shopId);
        if (row.error) throw new Error(`shop_subscriptions lookup failed: ${row.error}`);
        if (!row.id || !row.providerSubscriptionId || !eventSubscriptionId) {
          return await holdEvent(db, eventRowId, 'subscription_unidentified', held);
        }
        if (row.providerSubscriptionId !== eventSubscriptionId) {
          return await holdEvent(db, eventRowId, 'subscription_mismatch', held);
        }

        // profiles.plan is what planGate reads, so this is the write that removes access. 'free' is the existing
        // "no paid plan" value the signup trigger writes — not a plan chosen here.
        const { error: profileErr, count } = await db
          .from('profiles')
          .update({ plan: 'free', billing_status: 'suspended' }, { count: 'exact' })
          .eq('id', userId);
        if (profileErr) throw new Error(`profiles suspension failed: ${profileErr.message}`);
        if (count === 0) return await holdEvent(db, eventRowId, 'no_buyer_profile', held);

        const { error } = await db.from('shop_subscriptions').update({
          status:     'suspended',
          updated_at: new Date().toISOString(),
        }).eq('id', row.id);
        if (error) throw new Error(`suspension update failed: ${error.message}`);
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
      // The reason is kept on the event row and in the alert. It is not echoed to the caller: it is internal
      // database error text, and nothing outside needs it to decide to retry.
      return NextResponse.json({ error: 'Activation failed' }, { status: 500 });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[webhook/creem] unhandled error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
