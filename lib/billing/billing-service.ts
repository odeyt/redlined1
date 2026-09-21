/**
 * Billing service — high-level billing operations backed by Supabase.
 *
 * This is the layer between the payment provider and the rest of the app.
 * Feature gates, subscription status checks, and plan lookups all go through here.
 *
 * Rules:
 *  - No provider-specific types or field names outside this file's imports.
 *  - Safe fallbacks when billing tables don't exist or env vars are missing.
 *  - Idempotent event processing via provider_event_id uniqueness.
 */

import type { RedlinedSubscription, PaymentWebhookEvent, SubscriptionStatus, RedlinedPlanId } from '@/lib/payments/types';
import type { PlanConfig } from '@/config/plans';
import { PLANS } from '@/config/plans';
import { getAdminDb } from '@/lib/supabaseServer';
import { resolveProviderPlan, readProviderId, SELLABLE_PLANS } from '@/lib/billing/providerPlan';
import { readSubscriptionPeriod } from '@/lib/billing/creemPeriod';

/**
 * A billing event that names a buyer, but not the facts needed to grant anything safely. Thrown rather than
 * returned as null: null from extractSubscriptionFromCheckout means "not a Redlined1 checkout", which the route
 * acknowledges. This means "ours, and unreadable", which must stay unprocessed so it can be retried.
 * The reason is our own vocabulary and carries no customer data.
 */
export class BillingFactsError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`billing facts unusable: ${reason}`);
    this.name = 'BillingFactsError';
    this.reason = reason;
  }
}

const isPlainRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StoredSubscription {
  id: string;
  user_id: string;
  organization_id: string | null;
  provider: string;
  provider_customer_id: string;
  provider_subscription_id: string;
  provider_price_id: string | null;
  plan_id: RedlinedPlanId;
  billing_interval: string;
  status: SubscriptionStatus;
  // Nullable, matching the columns and the provider: a period we were not told is null, not 1970.
  current_period_start: string | null;
  current_period_end: string | null;
  trial_start: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Subscription lookups ─────────────────────────────────────────────────────

/** Returns the most recent active subscription for a user, or null. */
export async function getCurrentSubscription(userId: string): Promise<StoredSubscription | null> {
  try {
    const db = getAdminDb();
    const { data, error } = await db
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      // Table may not exist yet in dev — silent fail
      if (error.message?.includes('does not exist')) return null;
      console.error('[billing] getCurrentSubscription error:', error.message);
      return null;
    }
    return data as StoredSubscription | null;
  } catch {
    return null;
  }
}

/** Returns true if the user has a paying or trialing subscription. */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const sub = await getCurrentSubscription(userId);
  return sub !== null && ['active', 'trialing'].includes(sub.status);
}

/** Returns the user's current plan config, defaulting to starter. */
export async function getUserPlan(userId: string): Promise<PlanConfig> {
  const sub = await getCurrentSubscription(userId);
  const planId = (sub?.plan_id ?? 'starter') as RedlinedPlanId;
  return PLANS[planId] ?? PLANS.starter;
}

/** Returns true if the user's plan grants access to a specific feature key. */
export async function canAccessFeature(
  userId: string,
  featureKey: keyof PlanConfig['features'],
): Promise<boolean> {
  const plan = await getUserPlan(userId);
  const value = plan.features[featureKey];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return false;
}

// ─── Event recording ──────────────────────────────────────────────────────────

/**
 * What happened to one webhook event. The route turns this into an HTTP answer, and only 'applied' and 'ignored'
 * mark the event processed:
 *
 *   applied    the subscription and the entitlement were written
 *   ignored    nothing to do — not a Redlined1 checkout, an event type this route does not act on, or a
 *              subscription the provider does not know. Processed, so a redelivery is a harmless duplicate.
 *   retryable  a write, or the provider, failed. The same bytes may succeed later: left UNPROCESSED, answered 5xx.
 *   invalid    the event itself cannot be applied; the same bytes never will. Left UNPROCESSED, so a manual resend
 *              after the cause is fixed still works — but answered 200, because Creem redelivering unchanged bytes
 *              cannot help and would only repeat the failure.
 *
 * Reasons are this module's own vocabulary. They carry no customer data and are never an event body.
 */
export type EventOutcome =
  | { kind: 'applied' }
  | { kind: 'ignored'; reason: string }
  | { kind: 'retryable'; reason: string }
  | { kind: 'invalid'; reason: string };

/** 'process': new, or recorded earlier and never applied. 'duplicate': already applied. 'error': could not tell. */
export type RecordResult = 'process' | 'duplicate' | 'error';

/**
 * Records a raw payment event, and says whether to process it.
 *
 * Returned a boolean, and an insert that FAILED also returned false — which the route answers as "duplicate",
 * 200. A database failure was acknowledged as success and the event was lost. Failure is now its own answer.
 */
export async function recordPaymentEvent(event: PaymentWebhookEvent): Promise<RecordResult> {
  try {
    const db = getAdminDb();

    // Idempotency. payment_events is UNIQUE on (provider, provider_event_id), so there is at most one row and
    // maybeSingle is safe here. Only a PROCESSED row is a duplicate.
    //
    // This returned false for ANY existing row, so an event that failed — its row recorded, processed = false —
    // could never be processed again, not even by a manual resend once the missing fact was fixed. An unprocessed
    // row is now a retry: the same row is reused (the unique index forbids a second), and markEventProcessed
    // flips it only when the event actually applies.
    const { data: existing, error: lookupError } = await db
      .from('payment_events')
      .select('id, processed')
      .eq('provider_event_id', event.providerEventId)
      .eq('provider', event.provider)
      .maybeSingle();

    // A lookup that fails is not "no row": we cannot tell a new event from an applied one.
    if (lookupError) {
      console.error('[billing] recordPaymentEvent lookup failed:', lookupError.message);
      return 'error';
    }
    if (existing?.processed) return 'duplicate'; // already applied
    if (existing) return 'process';              // recorded earlier, never applied: process it now

    const { error } = await db.from('payment_events').insert({
      provider: event.provider,
      provider_event_id: event.providerEventId,
      event_type: event.type,
      payload: event.data,
      processed: false,
    });

    if (error) {
      // Includes a unique-index clash with a delivery that is recording the same event right now. Neither can be
      // told apart from here, so both are retryable: the redelivery reads the winner's row and acts on it.
      console.error('[billing] recordPaymentEvent insert failed:', error.message);
      return 'error';
    }
    return 'process';
  } catch (err) {
    console.error('[billing] recordPaymentEvent threw:', err instanceof Error ? err.message : 'unknown error');
    return 'error';
  }
}

/**
 * Marks a payment event as processed, and says whether that worked.
 *
 * Swallowed every error, so an event whose writes succeeded but whose mark failed stayed unprocessed while the
 * route answered 200 — nothing would ever retry it. The caller now answers 5xx instead, so Creem redelivers and the
 * mark is retried; the writes it repeats are idempotent (an upsert on provider_subscription_id and the same
 * profile values).
 *
 * payment_events has no error column, so there is no stored failure reason to clear here: flipping processed and
 * stamping processed_at is the whole of its failure state. Storing a reason would need a migration.
 */
export async function markEventProcessed(providerEventId: string, provider: string): Promise<boolean> {
  try {
    const db = getAdminDb();
    const { error } = await db
      .from('payment_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('provider_event_id', providerEventId)
      .eq('provider', provider);
    if (error) {
      console.error('[billing] markEventProcessed failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[billing] markEventProcessed threw:', err instanceof Error ? err.message : 'unknown error');
    return false;
  }
}

// ─── Subscription sync ────────────────────────────────────────────────────────

/**
 * Upserts a subscription record from a webhook event payload.
 * Called after verifying and recording the webhook event.
 */
/**
 * Statuses that GRANT paid access. Everything else writes billing_status only.
 *
 * The sync used to write profiles.plan = the purchased plan for EVERY status. profiles.plan is the one field
 * planGate reads for entitlement, so an incomplete, unknown or never-paid subscription granted full access the
 * moment any event about it arrived. Now:
 *
 *   active, trialing   grant: profiles.plan = the purchased plan
 *   suspended          REMOVE access: profiles.plan = 'free'. The purchased plan is kept on the subscription row
 *                      (plan_id), with the provider ids and the billing period, and a later active event restores
 *                      profiles.plan from the provider's product. 'free' is the existing "no paid plan" value the
 *                      signup trigger writes, not a plan invented here.
 *   anything else      billing_status only — neither granted nor taken away. A cancellation or a failed payment
 *                      does not demote profiles.plan; that is the standing policy (dunning), unchanged here.
 */
const GRANTING_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing']);

export async function syncSubscriptionFromProvider(
  sub: RedlinedSubscription,
): Promise<EventOutcome> {
  // Entitlement is per buyer. A subscription that names none cannot be applied, and writing the subscription row
  // anyway would leave a paid subscription no one is entitled through. Checked before anything is written.
  if (!sub.userId) return { kind: 'invalid', reason: 'the subscription names no buyer' };

  try {
    const db = getAdminDb();

    const record: Partial<StoredSubscription> & { updated_at: string } = {
      user_id: sub.userId,
      provider: sub.provider,
      provider_customer_id: sub.providerCustomerId,
      provider_subscription_id: sub.providerSubscriptionId,
      provider_price_id: sub.providerPriceId,
      plan_id: sub.planId,
      billing_interval: sub.billingInterval,
      status: sub.status,
      // A period is written only when the provider supplied one. An upsert that sends null would ERASE a
      // valid period already stored for this subscription — an event omitting its period is not evidence the
      // period is gone. Never invented either: these were once filled with 1970-01-01.
      ...(sub.currentPeriodStart ? { current_period_start: sub.currentPeriodStart.toISOString() } : {}),
      ...(sub.currentPeriodEnd   ? { current_period_end:   sub.currentPeriodEnd.toISOString() }   : {}),
      trial_start: sub.trialStart?.toISOString() ?? null,
      trial_end: sub.trialEnd?.toISOString() ?? null,
      cancel_at_period_end: sub.cancelAtPeriodEnd,
      canceled_at: sub.canceledAt?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    };

    // Each write is CHECKED. Both were fire-and-forget: a failed upsert was logged and the event was then marked
    // processed, so a subscription that never reached the database could never be retried.
    const { error } = await db
      .from('subscriptions')
      .upsert(record, { onConflict: 'provider_subscription_id' });
    if (error) {
      console.error('[billing] subscription write failed:', error.message);
      return { kind: 'retryable', reason: 'the subscription write failed' };
    }

    const entitlement: Record<string, unknown> =
      GRANTING_STATUSES.has(sub.status) ? { plan: sub.planId, billing_status: sub.status }
      : sub.status === 'suspended'      ? { plan: 'free', billing_status: 'suspended' }
      :                                   { billing_status: sub.status };

    const { error: profileError, count } = await db
      .from('profiles')
      .update(entitlement, { count: 'exact' })
      .eq('id', sub.userId);
    if (profileError) {
      console.error('[billing] entitlement write failed:', profileError.message);
      return { kind: 'retryable', reason: 'the entitlement write failed' };
    }
    // No profile row: a retry of the same bytes cannot create one.
    if (count === 0) return { kind: 'invalid', reason: 'the buyer has no profile to grant the plan to' };

    return { kind: 'applied' };
  } catch (err) {
    console.error('[billing] syncSubscriptionFromProvider threw:', err instanceof Error ? err.message : 'unknown error');
    return { kind: 'retryable', reason: 'the subscription sync threw' };
  }
}

/**
 * Extracts a RedlinedSubscription from a checkout.completed event payload.
 *
 *   null               NOT a Redlined1 checkout — no buyer and no plan named. Nothing is granted; the route
 *                      acknowledges it.
 *   BillingFactsError  ours, but a required fact is missing, unknown or contradictory. Thrown, so the route
 *                      skips markEventProcessed and the event stays unprocessed and retryable.
 *
 * What it used to do, on the live /api/webhooks/creem route:
 *   - period: now and now + 30 days, always — invented, and written to subscriptions.current_period_*;
 *   - plan:   meta.plan_id ?? 'starter', and any non-empty plan_id at all, sellable or not, went straight to
 *             profiles.plan, which planGate reads for entitlement;
 *   - ids:    String(d.subscription_id ?? '') — a missing subscription id became '', and every such checkout
 *             upserted onto the SAME subscriptions row (onConflict provider_subscription_id). A nested
 *             customer object became the string "[object Object]";
 *   - errors: any exception returned null, which the route then marked processed.
 */
export function extractSubscriptionFromCheckout(event: PaymentWebhookEvent): RedlinedSubscription | null {
  const d = (isPlainRecord(event.data) ? event.data : {}) as Record<string, unknown>;
  const nested = isPlainRecord(d.subscription) ? d.subscription : {};
  const meta = (isPlainRecord(d.metadata) ? d.metadata : isPlainRecord(nested.metadata) ? nested.metadata : {}) as Record<string, unknown>;

  const userId = typeof meta.user_id === 'string' ? meta.user_id.trim() : '';
  const namesPlan = [meta.plan_key, meta.plan_id].some(v => typeof v === 'string' && v.trim() !== '');
  if (!userId && !namesPlan) return null;
  if (!userId) throw new BillingFactsError('the checkout names a plan but no buyer');

  // The plan through the authoritative product mapping. Never defaulted.
  const plan = resolveProviderPlan(d, SELLABLE_PLANS);
  if (plan.kind === 'unusable') throw new BillingFactsError(plan.reason);

  const subscriptionId = readProviderId(d.subscription) || readProviderId(d.subscription_id);
  if (!subscriptionId) throw new BillingFactsError('the checkout names no provider subscription id');

  // The provider period, or unknown. Never now, never now + 30 days.
  const period = readSubscriptionPeriod(d);
  const now = new Date();

  return {
    id: subscriptionId,
    userId,
    provider: event.provider,
    providerCustomerId: readProviderId(d.customer) || readProviderId(d.customer_id),
    providerSubscriptionId: subscriptionId,
    providerPriceId: readProviderId(d.product) || readProviderId(nested.product) || readProviderId(d.product_id) || null,
    planId: plan.plan,
    billingInterval: meta.billing_interval === 'annual' ? 'annual' : 'monthly',
    status: 'active',
    currentPeriodStart: period.start,
    currentPeriodEnd: period.end,
    trialStart: null,
    trialEnd: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
