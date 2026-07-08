/**
 * commercial/subscriptions/subscriptionService.ts
 * Shop-scoped subscription management.
 * All reads/writes go through the Supabase admin client (service role).
 */

import { getAdminDb } from '@/lib/supabaseServer';
import type {
  ShopSubscription,
  SubscriptionStatus,
  SubscriptionState,
  PlanKey,
} from '@/commercial/shared/types';
import { getPlan } from '@/commercial/plans/planManager';

const BILLING_ENABLED = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';
const DEFAULT_TRIAL_DAYS = 14;

// ─── DB row → domain type ─────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): ShopSubscription {
  return {
    id:                     String(row.id),
    shopId:                 String(row.shop_id),
    planKey:                String(row.plan_key) as PlanKey,
    status:                 String(row.status) as SubscriptionStatus,
    billingProvider:        (row.billing_provider ?? 'creem') as ShopSubscription['billingProvider'],
    providerCustomerId:     (row.provider_customer_id as string) ?? null,
    providerSubscriptionId: (row.provider_subscription_id as string) ?? null,
    trialStart:             row.trial_start   ? new Date(row.trial_start as string)   : null,
    trialEnd:               row.trial_end     ? new Date(row.trial_end as string)     : null,
    currentPeriodStart:     row.current_period_start ? new Date(row.current_period_start as string) : null,
    currentPeriodEnd:       row.current_period_end   ? new Date(row.current_period_end as string)   : null,
    cancelAtPeriodEnd:      Boolean(row.cancel_at_period_end),
    cancelledAt:            row.cancelled_at  ? new Date(row.cancelled_at as string)  : null,
    pastDueAt:              row.past_due_at   ? new Date(row.past_due_at as string)   : null,
    metadata:               (row.metadata as Record<string, unknown>) ?? {},
    createdAt:              new Date(row.created_at as string),
    updatedAt:              new Date(row.updated_at as string),
  };
}

// ─── Public functions ─────────────────────────────────────────────────────────

export async function getShopSubscription(shopId: string): Promise<ShopSubscription | null> {
  try {
    const db = getAdminDb();
    const { data, error } = await db
      .from('shop_subscriptions')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.message?.includes('does not exist')) return null;
      console.error('[subscriptionService] getShopSubscription error:', error.message);
      return null;
    }
    return data ? mapRow(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function createTrialSubscription(
  shopId: string,
  planKey: PlanKey = 'professional',
  trialDays: number = DEFAULT_TRIAL_DAYS,
): Promise<ShopSubscription | null> {
  try {
    const db = getAdminDb();
    const now = new Date();
    const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    const { data, error } = await db
      .from('shop_subscriptions')
      .insert({
        shop_id:     shopId,
        plan_key:    planKey,
        status:      'trialing',
        trial_start: now.toISOString(),
        trial_end:   trialEnd.toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[subscriptionService] createTrialSubscription error:', error.message);
      return null;
    }
    return mapRow(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function activateSubscription(
  shopId: string,
  providerData: {
    providerCustomerId: string;
    providerSubscriptionId: string;
    planKey: PlanKey;
    provider: string;
    periodStart: Date;
    periodEnd: Date;
  },
): Promise<boolean> {
  try {
    const db = getAdminDb();
    const { error } = await db
      .from('shop_subscriptions')
      .upsert({
        shop_id:                 shopId,
        plan_key:                providerData.planKey,
        status:                  'active',
        billing_provider:        providerData.provider,
        provider_customer_id:    providerData.providerCustomerId,
        provider_subscription_id:providerData.providerSubscriptionId,
        current_period_start:    providerData.periodStart.toISOString(),
        current_period_end:      providerData.periodEnd.toISOString(),
        updated_at:              new Date().toISOString(),
      }, { onConflict: 'shop_id' });

    if (error) { console.error('[subscriptionService] activateSubscription error:', error.message); return false; }
    return true;
  } catch {
    return false;
  }
}

export async function updateSubscriptionStatus(
  shopId: string,
  status: SubscriptionStatus,
  extra?: Partial<{ cancelledAt: Date; pastDueAt: Date; cancelAtPeriodEnd: boolean }>,
): Promise<boolean> {
  try {
    const db = getAdminDb();
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (extra?.cancelledAt)      patch.cancelled_at      = extra.cancelledAt.toISOString();
    if (extra?.pastDueAt)        patch.past_due_at        = extra.pastDueAt.toISOString();
    if (extra?.cancelAtPeriodEnd !== undefined) patch.cancel_at_period_end = extra.cancelAtPeriodEnd;

    const { error } = await db.from('shop_subscriptions').update(patch).eq('shop_id', shopId);
    if (error) { console.error('[subscriptionService] updateSubscriptionStatus error:', error.message); return false; }
    return true;
  } catch {
    return false;
  }
}

export async function cancelSubscription(shopId: string, immediately = false): Promise<boolean> {
  if (immediately) {
    return updateSubscriptionStatus(shopId, 'cancelled', { cancelledAt: new Date() });
  }
  return updateSubscriptionStatus(shopId, 'active', { cancelAtPeriodEnd: true });
}

export async function resumeSubscription(shopId: string): Promise<boolean> {
  return updateSubscriptionStatus(shopId, 'active', { cancelAtPeriodEnd: false });
}

export async function isSubscriptionActive(shopId: string): Promise<boolean> {
  // If billing enforcement is disabled, all shops are treated as active
  if (!BILLING_ENABLED) return true;

  const sub = await getShopSubscription(shopId);
  if (!sub) return false;
  return ['active', 'trialing'].includes(sub.status);
}

export async function getSubscriptionState(shopId: string): Promise<SubscriptionState> {
  const sub = await getShopSubscription(shopId);
  const plan = sub ? getPlan(sub.planKey) : null;

  const now = Date.now();
  const isTrialing = sub?.status === 'trialing' && (sub.trialEnd ? sub.trialEnd.getTime() > now : false);
  const trialDaysLeft = isTrialing && sub?.trialEnd
    ? Math.max(0, Math.ceil((sub.trialEnd.getTime() - now) / 86400000))
    : null;

  return {
    subscription:      sub,
    plan,
    isActive:          !BILLING_ENABLED || ['active', 'trialing'].includes(sub?.status ?? ''),
    isTrialing,
    isPastDue:         sub?.status === 'past_due',
    trialDaysLeft,
    enforcementEnabled: BILLING_ENABLED,
  };
}
