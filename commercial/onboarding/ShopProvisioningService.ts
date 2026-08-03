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
import { TRIAL_DAYS } from '@/lib/planGate';
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

// ─── Plan provisioning ─────────────────────────────────────────────────────────

// Defined in lib/planGate so the signup page — a client component — can quote
// it without importing this server-only module. Re-exported for callers here.
export { TRIAL_DAYS };

/**
 * Settles a user's plan: a new account gets a {@link TRIAL_DAYS}-day trial with
 * every module unlocked; when that lapses it becomes Free Forever, keeping the
 * core features and all their data.
 *
 * Chosen deliberately on 2026-08-03. Under free-from-signup, a customer never
 * touched Vehicle Intake, Parts, Reports, Employees or AI Copilot, so the
 * Upgrade button asked them to pay for things they had never seen. It also made
 * accounts inconsistent: signups from July carried the legacy plan='trial' and
 * had full access, while August signups got 'free' and did not.
 *
 * The rules, in order. Each exists because the opposite has bitten:
 *
 *   paid              → untouched. Never downgrade a subscriber.
 *   active trial      → untouched. Re-granting would reset the clock on every
 *                       auth callback, including a password reset, so the trial
 *                       would never end.
 *   lapsed trial      → becomes Free Forever, trial_ends_at cleared. The
 *                       cleared date is what stops a second trial below.
 *   free + FUTURE end → promoted to trial. This is the contradictory state a
 *                       database trigger writes on signup: plan 'free' with a
 *                       trial date the app ignores. The date is honoured rather
 *                       than invented, so the clock still starts at signup.
 *   free + no end     → untouched. Their trial is over; they do not get another
 *                       one by signing in again.
 *   no plan at all    → fresh trial from now.
 *
 * usePlan() reads profiles.plan and profiles.trial_ends_at only, so this is the
 * single source of truth. Deliberately does not touch `subscriptions`: that
 * table is for real provider-linked subscriptions, and an earlier version
 * writing columns it does not have failed silently on every call.
 *
 * Idempotent — safe on every auth callback and every /api/provision request.
 */
export async function ensureInitialPlan(
  userId:   string,
  _shopId:   string,
  _intentPlanKey: CommercialPlanKey = null,
): Promise<{ plan: 'trial' | 'free' | 'unchanged' }> {
  const db = getAdminDb();

  const { data: existing } = await db
    .from('profiles')
    .select('plan, trial_ends_at')
    .eq('id', userId)
    .maybeSingle();

  const PAID = new Set(['pro', 'solo', 'starter', 'professional', 'business', 'enterprise']);
  const plan   = existing?.plan as string | null | undefined;
  const endsAt = existing?.trial_ends_at ? new Date(existing.trial_ends_at as string) : null;
  const active = endsAt !== null && endsAt > new Date();

  const apply = async (patch: { plan: string; trial_ends_at: string | null }) => {
    const { error } = await db.from('profiles').update(patch).eq('id', userId);
    if (error) throw new Error(`Failed to set plan: ${error.message}`);
  };

  if (plan && PAID.has(plan)) return { plan: 'unchanged' };

  if (plan === 'trial') {
    if (active) return { plan: 'unchanged' };
    await apply({ plan: 'free', trial_ends_at: null });   // lapsed → Free Forever
    return { plan: 'free' };
  }

  if (plan === 'free') {
    if (!active) return { plan: 'unchanged' };            // trial already spent
    await apply({ plan: 'trial', trial_ends_at: endsAt!.toISOString() });
    return { plan: 'trial' };
  }

  // No plan recorded — a genuinely new account.
  const ends = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  await apply({ plan: 'trial', trial_ends_at: ends.toISOString() });
  return { plan: 'trial' };
}
