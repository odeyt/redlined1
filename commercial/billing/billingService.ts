/**
 * commercial/billing/billingService.ts
 * THE ONLY BILLING ENTRY POINT for application code.
 *
 * Delegates to the active provider (Creem by default).
 * Never import creemProvider directly in feature code — always use this service.
 */

import { getAdminDb } from '@/lib/supabaseServer';
import { creemProvider } from '@/commercial/providers/creemProvider';
import type { IBillingProvider } from '@/commercial/providers/BillingProvider';
import type {
  CheckoutSessionInput,
  CheckoutSessionResult,
  BillingPortalInput,
  BillingPortalResult,
  CommercialDashboardData,
} from '@/commercial/shared/types';
import {
  getShopSubscription,
  activateSubscription,
  updateSubscriptionStatus,
} from '@/commercial/subscriptions/subscriptionService';
import { getMonthlyUsage } from '@/commercial/usage/usageService';
import { getPlan } from '@/commercial/plans/planManager';

// ─── Provider registry ────────────────────────────────────────────────────────

const PROVIDERS: Record<string, IBillingProvider> = {
  creem: creemProvider,
};

function getProvider(): IBillingProvider {
  const name = process.env.BILLING_PROVIDER ?? 'creem';
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown billing provider: ${name}`);
  return provider;
}

const BILLING_ENABLED = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';

// ─── Public API ───────────────────────────────────────────────────────────────

export async function createCheckout(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
  if (!BILLING_ENABLED) throw new Error('Billing is not enabled in this environment.');
  return getProvider().createCheckoutSession(input);
}

export async function openBillingPortal(input: BillingPortalInput): Promise<BillingPortalResult> {
  if (!BILLING_ENABLED) throw new Error('Billing is not enabled in this environment.');
  return getProvider().createBillingPortalSession(input);
}

export async function processWebhook(
  rawBody: string,
  signature: string,
  providerName: string,
): Promise<{ success: boolean; error?: string }> {
  const provider = PROVIDERS[providerName];
  if (!provider) return { success: false, error: `Unknown provider: ${providerName}` };

  const db = getAdminDb();
  const result = await provider.handleWebhook(rawBody, signature);

  if (!result.valid) {
    return { success: false, error: result.error ?? 'Invalid webhook' };
  }

  // Idempotency — skip if already processed
  if (result.providerEventId) {
    const { data: existing } = await db
      .from('billing_events')
      .select('id, processed')
      .eq('provider_event_id', result.providerEventId)
      .maybeSingle();

    if (existing?.processed) {
      return { success: true }; // already handled
    }
  }

  // Store raw event
  const { data: eventRow } = await db
    .from('billing_events')
    .insert({
      shop_id:           result.shopId,
      provider:          providerName,
      event_type:        result.eventType,
      provider_event_id: result.providerEventId,
      payload:           result.payload,
      processed:         false,
    })
    .select('id')
    .single();

  // Apply subscription update if present
  try {
    if (result.subscriptionUpdate && result.shopId) {
      const update = result.subscriptionUpdate;

      if (update.status === 'active' && update.providerCustomerId && update.providerSubscriptionId) {
        await activateSubscription(result.shopId, {
          providerCustomerId:    update.providerCustomerId,
          providerSubscriptionId: update.providerSubscriptionId,
          planKey:               update.planKey ?? 'professional',
          provider:              providerName,
          periodStart:           update.currentPeriodStart ?? new Date(),
          periodEnd:             update.currentPeriodEnd   ?? new Date(Date.now() + 30 * 86400000),
        });
      } else if (update.status) {
        await updateSubscriptionStatus(result.shopId, update.status, {
          cancelledAt:      update.cancelledAt ?? undefined,
          pastDueAt:        update.pastDueAt ?? undefined,
          cancelAtPeriodEnd: update.cancelAtPeriodEnd,
        });
      }
    }

    // Mark event processed
    if (eventRow?.id) {
      await db
        .from('billing_events')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('id', eventRow.id);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (eventRow?.id) {
      await db.from('billing_events').update({ error: msg }).eq('id', eventRow.id);
    }
    return { success: false, error: msg };
  }

  return { success: true };
}

export async function getBillingStatus(shopId: string) {
  const subscription = await getShopSubscription(shopId);
  return {
    billingEnabled: BILLING_ENABLED,
    subscription,
    plan: subscription ? getPlan(subscription.planKey) : null,
    isActive: !BILLING_ENABLED || ['active', 'trialing'].includes(subscription?.status ?? ''),
  };
}

export async function getCommercialDashboard(shopId: string): Promise<CommercialDashboardData> {
  const [subscription, usage] = await Promise.all([
    getShopSubscription(shopId),
    getMonthlyUsage(shopId),
  ]);

  const plan = subscription ? getPlan(subscription.planKey) : null;
  const now  = Date.now();
  const isTrialing = subscription?.status === 'trialing' && (subscription.trialEnd ? subscription.trialEnd.getTime() > now : false);
  const trialDaysLeft = isTrialing && subscription?.trialEnd
    ? Math.max(0, Math.ceil((subscription.trialEnd.getTime() - now) / 86400000))
    : null;

  return {
    subscription,
    plan,
    usage,
    billingEnabled: BILLING_ENABLED,
    trialDaysLeft,
    isActive:  !BILLING_ENABLED || ['active', 'trialing'].includes(subscription?.status ?? ''),
    isPastDue: subscription?.status === 'past_due',
  };
}

export async function syncSubscriptionFromProvider(
  shopId: string,
  providerSubscriptionId: string,
): Promise<boolean> {
  try {
    const remote = await getProvider().getSubscription(providerSubscriptionId);
    if (!remote) return false;

    await updateSubscriptionStatus(shopId, mapProviderStatus(remote.status), {
      cancelAtPeriodEnd: remote.cancelAtPeriodEnd,
      cancelledAt:       remote.cancelledAt ?? undefined,
    });
    return true;
  } catch {
    return false;
  }
}

function mapProviderStatus(s: string): 'active' | 'trialing' | 'past_due' | 'cancelled' | 'expired' | 'suspended' | 'manual' {
  if (s === 'trialing') return 'trialing';
  if (s === 'past_due') return 'past_due';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'expired')   return 'expired';
  if (s === 'suspended') return 'suspended';
  return 'active';
}
