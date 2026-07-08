/**
 * commercial/trials/onboardingHook.ts
 * Called when a new shop is created to set up the default trial subscription.
 *
 * Rules:
 * - Shop creation ALWAYS succeeds even if this hook fails.
 * - Default plan: professional, 14-day trial.
 * - Safe no-op when NEXT_PUBLIC_BILLING_ENABLED=false.
 */

import { createTrialSubscription } from '@/commercial/subscriptions/subscriptionService';
import type { PlanKey } from '@/commercial/shared/types';

const BILLING_ENABLED = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';
const DEFAULT_TRIAL_PLAN: PlanKey = 'professional';
const DEFAULT_TRIAL_DAYS = 14;

export interface OnboardingResult {
  success: boolean;
  subscriptionId: string | null;
  warning: string | null;
}

/**
 * Call this immediately after a new shop is created.
 * Never throws — catches all errors and returns a warning instead.
 */
export async function triggerShopOnboarding(shopId: string): Promise<OnboardingResult> {
  if (!BILLING_ENABLED) {
    return { success: true, subscriptionId: null, warning: null };
  }

  try {
    const sub = await createTrialSubscription(shopId, DEFAULT_TRIAL_PLAN, DEFAULT_TRIAL_DAYS);

    if (!sub) {
      console.warn(`[onboardingHook] Trial subscription creation returned null for shop ${shopId}`);
      return {
        success: false,
        subscriptionId: null,
        warning: 'Trial subscription could not be created. Please contact support.',
      };
    }

    console.info(`[onboardingHook] Created ${DEFAULT_TRIAL_DAYS}-day ${DEFAULT_TRIAL_PLAN} trial for shop ${shopId} (sub: ${sub.id})`);
    return { success: true, subscriptionId: sub.id, warning: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[onboardingHook] Failed for shop ${shopId}:`, msg);
    return {
      success: false,
      subscriptionId: null,
      warning: 'Billing setup encountered an issue. Your shop is active but billing may need manual setup.',
    };
  }
}
