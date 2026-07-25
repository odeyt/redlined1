/**
 * commercial/onboarding/ShopProvisioningService.ts
 *
 * Idempotent provisioning service for the commercial signup flow.
 * ALL functions are retry-safe: calling them multiple times with the same
 * inputs produces the same result and never creates duplicates.
 *
 * Server-side only — uses service-role client (getAdminDb).
 */

import { getAdminDb } from '@/lib/supabaseServer';
import type { CommercialPlanKey, BillingPeriod } from './types';

export interface ShopProvisioningInput {
  ownerName?: string;
  shopName:   string;
  currency?:  string;
  country?:   string;
  timezone?:  string;
}

export interface OnboardingSession {
  id:           string;
  userId:       string;
  shopId:       string | null;
  status:       'pending' | 'shop_created' | 'trial_created' | 'completed';
  intent:       string | null;
  planKey:      CommercialPlanKey;
  period:       BillingPeriod;
  completedAt:  string | null;
  createdAt:    string;
}

export interface ProvisionResult {
  shopId:     string;
  sessionId:  string;
  trialId:    string | null;
  created:    boolean; // false if already existed (idempotent)
}

// ─── Onboarding session ───────────────────────────────────────────────────────

/**
 * Returns existing onboarding session for the user, or creates one.
 * Safe to call on every auth callback — will not create duplicates.
 */
export async function getOrCreateOnboardingSession(
  userId:  string,
  intent:  string | null = null,
  planKey: CommercialPlanKey = null,
  period:  BillingPeriod = null,
): Promise<OnboardingSession> {
  const db = getAdminDb();

  const { data: existing } = await db
    .from('onboarding_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return mapSession(existing);

  const { data, error } = await db
    .from('onboarding_sessions')
    .insert({
      user_id:  userId,
      status:   'pending',
      intent,
      plan_key: planKey,
      period,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create onboarding session: ${error.message}`);
  return mapSession(data);
}

// ─── Shop provisioning ────────────────────────────────────────────────────────

/**
 * Returns the owner's existing primary shop, or creates one.
 * Prevents duplicate shops on callback retries.
 */
export async function getOrCreatePrimaryShop(
  userId: string,
  input:  ShopProvisioningInput,
): Promise<{ shopId: string; created: boolean }> {
  const db = getAdminDb();

  // Check for existing owner membership
  const { data: existing } = await db
    .from('shop_users')
    .select('shop_id')
    .eq('user_id', userId)
    .eq('role', 'owner')
    .maybeSingle();

  if (existing?.shop_id) return { shopId: existing.shop_id, created: false };

  // Create shop
  const { data: shop, error: shopErr } = await db
    .from('shops')
    .insert({
      name:      input.shopName || 'My Shop',
      currency:  input.currency ?? 'USD',
      country:   input.country  ?? null,
      timezone:  input.timezone ?? null,
    })
    .select('id')
    .single();

  if (shopErr) throw new Error(`Failed to create shop: ${shopErr.message}`);

  // Create owner membership
  await ensureOwnerMembership(userId, shop.id);

  // Update onboarding session
  await db
    .from('onboarding_sessions')
    .update({ shop_id: shop.id, status: 'shop_created' })
    .eq('user_id', userId)
    .eq('status', 'pending');

  return { shopId: shop.id, created: true };
}

/**
 * Ensures the user has an owner role in the given shop.
 * Idempotent — safe to call multiple times.
 */
export async function ensureOwnerMembership(userId: string, shopId: string): Promise<void> {
  const db = getAdminDb();
  await db.from('shop_users').upsert(
    { user_id: userId, shop_id: shopId, role: 'owner' },
    { onConflict: 'user_id,shop_id' },
  );
}

// ─── Free plan provisioning ────────────────────────────────────────────────────

/**
 * Grants the given user a permanent Free Forever plan — no expiry, no
 * time-based lockout. Usage limits (job count, customer count, etc.) are
 * enforced separately (see supabase/migrations/free_tier_usage_limits.sql),
 * not by this function.
 *
 * Deliberately does NOT touch the `subscriptions` table: that table is a
 * payment-provider-linked record (provider, provider_customer_id,
 * provider_subscription_id, billing_interval are all NOT NULL columns in
 * production) — it exists for real Stripe/Creem subscriptions, not for
 * tracking free-tier status. A prior version of this function tried to
 * insert a shop_id/plan_key/trial_started_at row there; those columns
 * don't exist on the real table, so every call failed, was silently
 * swallowed by auth/callback's try/catch, and profiles.plan was never
 * actually set — confirmed via information_schema against production.
 *
 * usePlan() (lib/usePlan.ts) reads plan status from profiles.plan /
 * profiles.trial_ends_at only, so that's the sole source of truth here.
 * Idempotent — a no-op if the user already has a non-null plan.
 */
export async function ensureFreeSubscription(
  userId:   string,
  _shopId:   string,
  _intentPlanKey: CommercialPlanKey = null,
): Promise<{ created: boolean }> {
  const db = getAdminDb();

  const { data: existing } = await db
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .maybeSingle();

  if (existing?.plan) return { created: false };

  const { error } = await db
    .from('profiles')
    .update({ plan: 'free', trial_ends_at: null })
    .eq('id', userId);

  if (error) throw new Error(`Failed to grant free plan: ${error.message}`);

  // Update onboarding session status
  await db
    .from('onboarding_sessions')
    .update({ status: 'trial_created' })
    .eq('user_id', userId)
    .in('status', ['pending', 'shop_created']);

  return { created: true };
}

// ─── Onboarding completion ────────────────────────────────────────────────────

export async function completeOnboarding(userId: string, shopId: string): Promise<void> {
  const db = getAdminDb();
  await db
    .from('onboarding_sessions')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('shop_id', shopId);
}

/** Returns the most recent onboarding session for resume flows. */
export async function resumeOnboarding(userId: string): Promise<OnboardingSession | null> {
  const db = getAdminDb();
  const { data } = await db
    .from('onboarding_sessions')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? mapSession(data) : null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapSession(row: Record<string, unknown>): OnboardingSession {
  return {
    id:          String(row.id ?? ''),
    userId:      String(row.user_id ?? ''),
    shopId:      row.shop_id ? String(row.shop_id) : null,
    status:      (row.status as OnboardingSession['status']) ?? 'pending',
    intent:      row.intent ? String(row.intent) : null,
    planKey:     (row.plan_key as CommercialPlanKey) ?? null,
    period:      (row.period as BillingPeriod) ?? null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    createdAt:   String(row.created_at ?? ''),
  };
}
