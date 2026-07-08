/**
 * commercial/licensing/licenseService.ts
 * License enforcement engine. Always fails safely.
 * When NEXT_PUBLIC_BILLING_ENABLED=false, all checks return allowed=true.
 */

import { getAdminDb } from '@/lib/supabaseServer';
import type { LicenseCheckResult } from '@/commercial/shared/types';
import { getShopSubscription } from '@/commercial/subscriptions/subscriptionService';
import { getPlanLimits } from '@/commercial/plans/planManager';

const BILLING_ENABLED = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';

// ─── Safe allow fallback ──────────────────────────────────────────────────────

function allow(reason = 'allowed'): LicenseCheckResult {
  return { allowed: true, reason, planKey: null, limit: null, current: null };
}

function deny(reason: string, planKey: string | null, limit: number | null, current: number | null): LicenseCheckResult {
  return { allowed: false, reason, planKey: planKey as LicenseCheckResult['planKey'], limit, current };
}

// ─── Core check ───────────────────────────────────────────────────────────────

export async function checkLicense(shopId: string, checkKey: string): Promise<LicenseCheckResult> {
  try {
    if (!BILLING_ENABLED) return allow('billing_disabled');

    const sub = await getShopSubscription(shopId);
    if (!sub) return allow('no_subscription_found');

    const active = ['active', 'trialing'].includes(sub.status);
    if (!active) return deny('subscription_not_active', sub.planKey, null, null);

    return allow('subscription_active');
  } catch {
    // Always fail open — never block production on an error
    return allow('license_check_error');
  }
}

export async function checkUserLimit(shopId: string): Promise<LicenseCheckResult> {
  try {
    if (!BILLING_ENABLED) return allow('billing_disabled');

    const sub = await getShopSubscription(shopId);
    if (!sub) return allow('no_subscription');

    const limits = getPlanLimits(sub.planKey);
    if (limits.maxUsers === null) return allow('unlimited');

    const db = getAdminDb();
    const { count } = await db
      .from('shop_users')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId);

    const current = count ?? 0;
    if (current >= limits.maxUsers) {
      return deny(`User limit reached (${current}/${limits.maxUsers})`, sub.planKey, limits.maxUsers, current);
    }
    return { allowed: true, reason: 'within_limit', planKey: sub.planKey as LicenseCheckResult['planKey'], limit: limits.maxUsers, current };
  } catch {
    return allow('user_limit_check_error');
  }
}

export async function checkLocationLimit(shopId: string): Promise<LicenseCheckResult> {
  try {
    if (!BILLING_ENABLED) return allow('billing_disabled');

    const sub = await getShopSubscription(shopId);
    if (!sub) return allow('no_subscription');

    const limits = getPlanLimits(sub.planKey);
    if (limits.maxLocations === null) return allow('unlimited');

    const db = getAdminDb();
    const { count } = await db
      .from('shops')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', shopId);

    const current = count ?? 1;
    if (current >= limits.maxLocations) {
      return deny(`Location limit reached (${current}/${limits.maxLocations})`, sub.planKey, limits.maxLocations, current);
    }
    return { allowed: true, reason: 'within_limit', planKey: sub.planKey as LicenseCheckResult['planKey'], limit: limits.maxLocations, current };
  } catch {
    return allow('location_limit_check_error');
  }
}

export async function checkAICredits(shopId: string): Promise<LicenseCheckResult> {
  try {
    if (!BILLING_ENABLED) return allow('billing_disabled');

    const sub = await getShopSubscription(shopId);
    if (!sub) return allow('no_subscription');

    const limits = getPlanLimits(sub.planKey);
    if (limits.aiCreditsPerMonth === null) return allow('unlimited');
    if (limits.aiCreditsPerMonth === 0) return deny('No AI credits on this plan', sub.planKey, 0, null);

    // Usage checked via usageService — lightweight check here
    return { allowed: true, reason: 'credits_available', planKey: sub.planKey as LicenseCheckResult['planKey'], limit: limits.aiCreditsPerMonth, current: null };
  } catch {
    return allow('ai_credits_check_error');
  }
}

export async function checkStorageLimit(_shopId: string): Promise<LicenseCheckResult> {
  // Storage enforcement is tracked but not blocked at this MVP stage
  if (!BILLING_ENABLED) return allow('billing_disabled');
  return allow('storage_not_enforced_yet');
}

export async function recordLicenseCheck(
  shopId: string,
  userId: string | null,
  checkKey: string,
  result: LicenseCheckResult,
): Promise<void> {
  try {
    const db = getAdminDb();
    await db.from('license_checks').insert({
      shop_id:   shopId,
      user_id:   userId,
      check_key: checkKey,
      allowed:   result.allowed,
      reason:    result.reason,
      metadata:  { planKey: result.planKey, limit: result.limit, current: result.current },
    });
  } catch {
    // Non-critical
  }
}
