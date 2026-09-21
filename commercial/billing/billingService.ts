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
import { mapRemoteStatus } from '@/commercial/providers/BillingProvider';
import type {
  CheckoutSessionInput,
  CheckoutSessionResult,
  BillingPortalInput,
  BillingPortalResult,
  CommercialDashboardData,
  BillingPlan,
} from '@/commercial/shared/types';
import {
  getShopSubscription,
  activateSubscription,
  updateSubscriptionStatus,
} from '@/commercial/subscriptions/subscriptionService';
import { getMonthlyUsage } from '@/commercial/usage/usageService';
import { getPlan } from '@/commercial/plans/planManager';
import { getPlanStatus, trialDaysLeft as computeTrialDaysLeft } from '@/lib/planGate';

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

  // Idempotency, on (provider, provider_event_id).
  //
  // This used .maybeSingle(), which resolves to { data: null } — with its error unread — as soon as there are
  // TWO rows for the event. And every retry inserted a fresh row. So one failed attempt plus one successful retry
  // left two rows, and the next redelivery saw "no existing row", was applied AGAIN, and added a third.
  // Now: any processed row means done; otherwise the earliest unprocessed row is REUSED, so a retry updates the
  // row that recorded the failure instead of adding one. A lookup that fails is not "none": nothing is applied.
  let eventRowId: string | null = null;
  if (result.providerEventId) {
    const { data: rows, error: lookupError } = await db
      .from('billing_events')
      .select('id, processed')
      .eq('provider', providerName)
      .eq('provider_event_id', result.providerEventId)
      .order('created_at', { ascending: true });
    if (lookupError) return { success: false, error: `event lookup failed: ${lookupError.message}` };

    const found = (rows ?? []) as Array<{ id: string; processed: boolean | null }>;
    if (found.some(r => r.processed)) return { success: true }; // already handled
    if (found.length > 0) eventRowId = String(found[0].id);
  }

  // Store raw event — only if there is no earlier attempt to reuse. An event we cannot record is not applied:
  // without its row, a failure could not be kept visible and a success could not be recognised on redelivery.
  if (!eventRowId) {
    const { data: inserted, error: insertError } = await db
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
    if (insertError || !inserted?.id) {
      return { success: false, error: `event could not be recorded: ${insertError?.message ?? 'no row returned'}` };
    }
    eventRowId = String(inserted.id);
  }
  const eventRow = { id: eventRowId };

  // Apply subscription update if present
  try {
    // The provider read the event but could not interpret it (an unrecognised status, say). Throwing lands in
    // the catch below, which records the reason on the event row and leaves it unprocessed, so it is visible and
    // can be retried — rather than being marked processed with nothing applied.
    if (result.error) throw new Error(result.error);

    if (result.subscriptionUpdate) {
      const update = result.subscriptionUpdate;

      // A subscription change with no shop cannot be applied anywhere. It used to be skipped and the event then
      // marked processed, which lost it silently.
      if (!result.shopId) throw new Error('subscription event names no shop');

      if (update.activation) {
        // Activation GRANTS a paid plan. Every fact is required and none is defaulted. This was:
        //   planKey:     update.planKey ?? 'professional'
        //   periodStart: update.currentPeriodStart ?? new Date()
        //   periodEnd:   update.currentPeriodEnd   ?? new Date(Date.now() + 30 * 86400000)
        // The provider layer already refuses these; this is the second lock, so a provider that omits a fact
        // can never reach a grant.
        if (!update.planKey) throw new Error('activation carries no plan');
        if (!update.providerCustomerId || !update.providerSubscriptionId) {
          throw new Error('activation carries no provider customer id or no provider subscription id');
        }
        const activated = await activateSubscription(result.shopId, {
          providerCustomerId:     update.providerCustomerId,
          providerSubscriptionId: update.providerSubscriptionId,
          planKey:                update.planKey,
          provider:               providerName,
          periodStart:            update.currentPeriodStart ?? null,
          periodEnd:              update.currentPeriodEnd   ?? null,
        });
        // activateSubscription reports a failed write as false rather than throwing, and this used to ignore it
        // and mark the event processed — so a failed activation could never be retried.
        if (!activated) throw new Error('activation write failed');
      } else if (update.status) {
        // A status change touches only status and its own timestamps — never the plan, the provider ids or the
        // period. That is what lets 'suspended' be a temporary loss of entitlement rather than a cancellation:
        // everything needed to resume is left exactly as it was.
        const updated = await updateSubscriptionStatus(result.shopId, update.status, {
          cancelledAt:      update.cancelledAt ?? undefined,
          pastDueAt:        update.pastDueAt ?? undefined,
          cancelAtPeriodEnd: update.cancelAtPeriodEnd,
        });
        if (!updated) throw new Error('status write failed');
      }
    }

    // Mark event processed — and clear the reason a previous attempt recorded. A retry that succeeds reuses the
    // row that held the failure, and an applied event must not keep saying why it once could not be applied.
    if (eventRow?.id) {
      await db
        .from('billing_events')
        .update({ processed: true, processed_at: new Date().toISOString(), error: null })
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

// Display-only plans for shops with no `shop_subscriptions` row — i.e.
// every shop on the in-house Free Forever / 7-day-trial system
// (profiles.plan + profiles.trial_ends_at, see lib/planGate.ts), which is
// what actually governs access for real customers today. The commercial/
// module's own plan catalog (planManager.ts) only knows about
// starter/professional/business/enterprise — it has no entry for 'free',
// 'solo', or an active trial, so without this fallback the Billing page
// showed "Unknown" for every Free Forever or trial shop even though the
// sidebar (which reads the same profiles columns) displayed the real plan
// and days-left correctly. Copy matches components/marketing/PricingSection.tsx.
const FALLBACK_PLANS: Record<string, BillingPlan> = {
  trial: {
    id: 'trial', planKey: 'starter' as BillingPlan['planKey'], name: 'Free Trial',
    description: '7-day trial — full platform access.',
    monthlyPrice: 0, annualPrice: 0, currency: 'USD',
    limits: { maxUsers: null, maxLocations: null, maxVehicles: null, maxJobCardsPerMonth: null, aiCreditsPerMonth: null, storageGb: null },
    isActive: true, metadata: {},
  },
  free: {
    id: 'free', planKey: 'starter' as BillingPlan['planKey'], name: 'Free Forever',
    description: 'Full platform access, no credit card required.',
    monthlyPrice: 0, annualPrice: 0, currency: 'USD',
    limits: { maxUsers: 1, maxLocations: 1, maxVehicles: 10, maxJobCardsPerMonth: 5, aiCreditsPerMonth: 0, storageGb: null },
    isActive: true, metadata: {},
  },
  solo: {
    id: 'solo', planKey: 'starter' as BillingPlan['planKey'], name: 'Solo',
    description: 'For independent and mobile mechanics.',
    monthlyPrice: 24, annualPrice: 240, currency: 'USD',
    limits: { maxUsers: 1, maxLocations: 1, maxVehicles: null, maxJobCardsPerMonth: null, aiCreditsPerMonth: null, storageGb: null },
    isActive: true, metadata: {},
  },
};

export async function getBillingStatus(shopId: string): Promise<CommercialDashboardData> {
  const subscription = await getShopSubscription(shopId);

  if (subscription) {
    const now = Date.now();
    const isTrialing = subscription.status === 'trialing' && (subscription.trialEnd ? subscription.trialEnd.getTime() > now : false);
    return {
      billingEnabled: BILLING_ENABLED,
      subscription,
      plan: getPlan(subscription.planKey),
      usage: await getMonthlyUsage(shopId),
      trialDaysLeft: isTrialing && subscription.trialEnd
        ? Math.max(0, Math.ceil((subscription.trialEnd.getTime() - now) / 86400000))
        : null,
      isActive: !BILLING_ENABLED || ['active', 'trialing'].includes(subscription.status),
      isPastDue: subscription.status === 'past_due',
    };
  }

  // No commercial subscription row — fall back to the in-house plan system.
  const db = getAdminDb();
  const { data: owner } = await db
    .from('shop_users')
    .select('user_id')
    .eq('shop_id', shopId)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle();

  let ownerPlan: string | null = null;
  let ownerTrialEndsAt: string | null = null;
  if (owner?.user_id) {
    const { data: profile } = await db
      .from('profiles')
      .select('plan, trial_ends_at')
      .eq('id', owner.user_id)
      .maybeSingle();
    ownerPlan = profile?.plan ?? null;
    ownerTrialEndsAt = profile?.trial_ends_at ?? null;
  }

  const status = getPlanStatus(ownerPlan, ownerTrialEndsAt);
  const plan =
    status === 'trial' ? FALLBACK_PLANS.trial
    : status === 'free' ? FALLBACK_PLANS.free
    : (ownerPlan && getPlan(ownerPlan)) || FALLBACK_PLANS[ownerPlan ?? ''] || null;

  return {
    billingEnabled: BILLING_ENABLED,
    subscription: null,
    plan,
    usage: await getMonthlyUsage(shopId),
    trialDaysLeft: status === 'trial' ? computeTrialDaysLeft(ownerTrialEndsAt) : null,
    isActive: status !== 'free' || !BILLING_ENABLED,
    isPastDue: false,
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

    // Never defaulted. This was mapProviderStatus(), which returned 'active' for anything it did not list —
    // including 'unpaid' and 'paused', both of which getSubscription accepts as real statuses.
    const status = mapRemoteStatus(remote.status);
    if (!status) return false;

    // The write's own result, not an unconditional true: updateSubscriptionStatus reports failure as false.
    return await updateSubscriptionStatus(shopId, status, {
      cancelAtPeriodEnd: remote.cancelAtPeriodEnd,
      cancelledAt:       remote.cancelledAt ?? undefined,
    });
  } catch {
    return false;
  }
}

