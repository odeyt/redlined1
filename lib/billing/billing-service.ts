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
  current_period_start: string;
  current_period_end: string;
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

/** Records a raw payment event. Returns false if already processed (idempotent). */
export async function recordPaymentEvent(event: PaymentWebhookEvent): Promise<boolean> {
  try {
    const db = getAdminDb();

    // Check idempotency — skip if already processed
    const { data: existing } = await db
      .from('payment_events')
      .select('id')
      .eq('provider_event_id', event.providerEventId)
      .eq('provider', event.provider)
      .maybeSingle();

    if (existing) return false; // already processed

    const { error } = await db.from('payment_events').insert({
      provider: event.provider,
      provider_event_id: event.providerEventId,
      event_type: event.type,
      payload: event.data,
      processed: false,
    });

    if (error) {
      console.error('[billing] recordPaymentEvent error:', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Marks a payment event as processed. */
export async function markEventProcessed(providerEventId: string, provider: string): Promise<void> {
  try {
    const db = getAdminDb();
    await db
      .from('payment_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('provider_event_id', providerEventId)
      .eq('provider', provider);
  } catch {
    // Non-critical
  }
}

// ─── Subscription sync ────────────────────────────────────────────────────────

/**
 * Upserts a subscription record from a webhook event payload.
 * Called after verifying and recording the webhook event.
 */
export async function syncSubscriptionFromProvider(
  sub: RedlinedSubscription,
): Promise<void> {
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
      current_period_start: sub.currentPeriodStart.toISOString(),
      current_period_end: sub.currentPeriodEnd.toISOString(),
      trial_start: sub.trialStart?.toISOString() ?? null,
      trial_end: sub.trialEnd?.toISOString() ?? null,
      cancel_at_period_end: sub.cancelAtPeriodEnd,
      canceled_at: sub.canceledAt?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await db
      .from('subscriptions')
      .upsert(record, { onConflict: 'provider_subscription_id' });

    if (error) console.error('[billing] syncSubscriptionFromProvider error:', error.message);

    // Also sync plan_id → profiles.plan for backward compat with planGate.ts
    if (sub.userId) {
      await db
        .from('profiles')
        .update({ plan: sub.planId, billing_status: sub.status })
        .eq('id', sub.userId);
    }
  } catch (err) {
    console.error('[billing] syncSubscriptionFromProvider threw:', err);
  }
}

/** Extracts a RedlinedSubscription from a checkout.completed event payload. */
export function extractSubscriptionFromCheckout(event: PaymentWebhookEvent): RedlinedSubscription | null {
  try {
    const d = event.data as Record<string, unknown>;
    const meta = (d.metadata ?? {}) as Record<string, string>;

    if (!meta.user_id || !meta.plan_id) return null;

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return {
      id: String(d.subscription_id ?? d.id ?? ''),
      userId: meta.user_id,
      provider: event.provider,
      providerCustomerId: String(d.customer_id ?? d.customer ?? ''),
      providerSubscriptionId: String(d.subscription_id ?? ''),
      providerPriceId: String(d.price_id ?? d.product_id ?? ''),
      planId: (meta.plan_id ?? 'starter') as RedlinedPlanId,
      billingInterval: (meta.billing_interval ?? 'monthly') as 'monthly' | 'annual',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      trialStart: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      createdAt: now,
      updatedAt: now,
    };
  } catch {
    return null;
  }
}
