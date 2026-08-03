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
import type { CommercialPlanKey } from './types';

export interface ShopProvisioningInput {
  ownerName?: string;
  shopName:   string;
  currency?:  string;
  country?:   string;
  timezone?:  string;
}

// Removed on 2026-08-02: OnboardingSession, ProvisionResult,
// getOrCreateOnboardingSession(), completeOnboarding(), resumeOnboarding() and
// two writes inside the functions below.
//
// They all targeted public.onboarding_sessions, which does not exist — a GRANT
// against it fails with 42P01. Nothing outside this file ever called the
// exported ones, and the two writes were UPDATEs against rows nothing inserted,
// so they would have matched zero rows even had the table been there. Their
// results were unchecked, so every call failed silently on each confirmed
// login.
//
// Removed rather than resolved by creating the table: a multi-step onboarding
// flow with resume support is a feature to design deliberately, not to infer
// from dead code. If one is wanted later, the table and this logic should be
// written together, with checked results.
//
// Nothing else changes. Shop and membership creation, and the Free Forever
// grant, never depended on any of it.

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

  // The shops table has exactly four columns: id, name, slug, created_at.
  // This insert also sent currency, country and timezone, so PostgREST rejected
  // it with "could not find the 'country' column of 'shops' in the schema
  // cache" — meaning shop creation failed for EVERY new signup. It went
  // unnoticed because the only caller is the auth callback, which catches
  // provisioning errors so a failure cannot block login. The user lands in a
  // working app whose sidebar shows its "My Shop" defaults, and nothing
  // indicates the shop was never created until they try to pay.
  //
  // Nothing in the codebase reads currency, country or timezone from shops, so
  // they are dropped rather than added to the schema. They stay on the input
  // type for callers that pass them.
  const name = input.shopName || 'My Shop';

  // slug is nullable — three existing rows have null — so this is not required.
  // It is populated anyway because a shop with a readable slug is more useful
  // than one without, and the random suffix keeps it unique: two shops may
  // legitimately share a name.
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shop'}-${crypto.randomUUID().slice(0, 8)}`;

  const { data: shop, error: shopErr } = await db
    .from('shops')
    .insert({ name, slug })
    .select('id')
    .single();

  if (shopErr) throw new Error(`Failed to create shop: ${shopErr.message}`);

  // Create owner membership
  await ensureOwnerMembership(userId, shop.id);

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
    .select('plan, trial_ends_at')
    .eq('id', userId)
    .maybeSingle();

  // A database trigger creates the profile row with the legacy plan='trial'
  // before this runs, so an "is plan set?" check here would always be true and
  // Free Forever would never be granted — that is what happened to every
  // account created up to 2026-07-30. Treat null and a *lapsed* legacy trial as
  // unset, while leaving these alone:
  //   - real paid plans (never downgrade a subscriber)
  //   - an ACTIVE trial (a deliberately granted evaluation period; converting
  //     it to free here would cancel the trial on any later auth callback,
  //     e.g. a password reset)
  const PAID = new Set(['pro', 'solo', 'starter', 'professional', 'business', 'enterprise']);
  const plan = existing?.plan;

  if (plan && PAID.has(plan)) return { created: false };

  if (plan === 'trial') {
    const endsAt = existing?.trial_ends_at ? new Date(existing.trial_ends_at as string) : null;
    if (endsAt && endsAt > new Date()) return { created: false }; // active trial
    // lapsed or open-ended legacy trial → fall through to Free Forever
  } else if (plan) {
    return { created: false }; // already 'free' or another terminal state
  }

  const { error } = await db
    .from('profiles')
    .update({ plan: 'free', trial_ends_at: null })
    .eq('id', userId);

  if (error) throw new Error(`Failed to grant free plan: ${error.message}`);

  return { created: true };
}
