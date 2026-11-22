/**
 * Redline AI — who gets it: the feature flag OR a qualifying paid plan.
 *
 * Two independent ways in, one decision, used identically by the API route
 * (app/api/redline-ai), the flag feed the sidebar reads
 * (app/api/feature-flags), and the morning-brief job (lib/morningBrief):
 *
 *   1. the `redline_ai` feature flag (lib/featureFlags) — how the prototype
 *      was piloted on D1 Imports, and still the override;
 *   2. the shop's paid plan — Professional, Business and Enterprise include
 *      Redline AI (lib/planGate planIncludesRedlineAi). The plan is read
 *      from the shop OWNER's profile (profiles.plan via the shop_users
 *      owner row): the same source /api/ai's quota gate reads, because
 *      entitlement in this codebase lives on the owner's profile, not on
 *      the shops row.
 *
 * ## Where the plan gate sits in flag priority
 *
 * Flag evaluation priority is user > role > shop > environment > global
 * (featureFlagService.evaluateFlag). The plan gate is an OR condition AT
 * THE SHOP LEVEL, inserted immediately after the shop-scoped flag row:
 *
 *   user row → role row → shop row → PLAN → environment row → global row
 *
 * Consequences, all deliberate:
 *   - An explicit shop-scoped flag row wins over the plan either way: a
 *     pilot shop on a free plan stays on (shop row true), and a shop
 *     deliberately switched off stays off even on Business (shop row
 *     false) — the plan never resurrects a shop someone turned off.
 *   - User- and role-scoped rows still outrank everything, as before.
 *   - The plan outranks environment and global rows. It has to: the
 *     global redline_ai row is `false` (the prototype default), and a plan
 *     gate ranked below it would never turn anything on.
 *   - No flag rows and no qualifying plan → false. Fail-closed, unchanged.
 */
import { planIncludesRedlineAi } from '@/lib/planGate';
import type { FeatureFlag, FlagEvaluationContext } from '@/lib/featureFlags/types';

export const REDLINE_AI_FLAG_KEY = 'redline_ai';

/**
 * The full decision, pure: flag rows + evaluation context + the shop
 * owner's raw plan value (profiles.plan, or null when unread).
 */
export function evaluateRedlineAiAccess(
  flags: readonly FeatureFlag[],
  ctx: FlagEvaluationContext,
  plan: string | null,
): boolean {
  const rows = flags.filter(f => f.flag_key === REDLINE_AI_FLAG_KEY);

  const findEnabled = (pred: (f: FeatureFlag) => boolean): boolean | null => {
    const match = rows.find(pred);
    return match ? match.enabled : null;
  };

  // 1–3. Flag scopes above the shop level, then the shop row itself —
  // identical to evaluateFlag so far.
  const userResult = findEnabled(f => f.scope === 'user' && f.user_id === ctx.userId);
  if (userResult !== null) return userResult;

  const roleResult = findEnabled(f => f.scope === 'role' && f.role === ctx.role);
  if (roleResult !== null) return roleResult;

  const shopResult = findEnabled(f => f.scope === 'shop' && f.shop_id === ctx.shopId);
  if (shopResult !== null) return shopResult;

  // 4. The plan gate — an OR at the shop level. Only ever turns access ON;
  // a non-qualifying plan falls through to the remaining flag scopes.
  if (planIncludesRedlineAi(plan)) return true;

  // 5–6. Environment, then global, then the fail-closed default.
  const envResult = findEnabled(f => f.scope === 'environment' && f.environment === ctx.environment);
  if (envResult !== null) return envResult;

  const globalResult = findEnabled(f => f.scope === 'global');
  if (globalResult !== null) return globalResult;

  return false;
}

/**
 * The same decision for a shop with no signed-in user — the morning-brief
 * job's shape. Empty user/role context can never match a user- or
 * role-scoped row, so this reduces to shop row → plan → environment →
 * global, exactly the per-shop part of the rule above.
 */
export function evaluateRedlineAiForShop(
  flags: readonly FeatureFlag[],
  shopId: string,
  plan: string | null,
  environment: FlagEvaluationContext['environment'] = 'production',
): boolean {
  return evaluateRedlineAiAccess(flags, { userId: '', shopId, role: '', environment }, plan);
}

// ── Server-side reads ────────────────────────────────────────────────────────

/** The query surface these reads need, so tests can supply a stub. */
export interface AccessDb {
  from(table: string): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyChain = any;

function t(db: AccessDb, name: string): AnyChain {
  return db.from(name) as AnyChain;
}

/**
 * The shop owner's raw plan (profiles.plan), or null when the shop has no
 * owner row or the profile carries none. Mirrors lib/ai/aiQuota.ts: usage
 * and entitlement are billed to the shop, and every shop has exactly one
 * owner row. Errors read as null — a plan we cannot read never grants
 * access it cannot prove, and the flag path is unaffected.
 */
export async function fetchShopOwnerPlan(db: AccessDb, shopId: string): Promise<string | null> {
  try {
    const { data: owner } = await t(db, 'shop_users')
      .select('user_id')
      .eq('shop_id', shopId)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle();
    const ownerId = (owner as { user_id?: string } | null)?.user_id;
    if (!ownerId) return null;
    const { data: profile } = await t(db, 'profiles')
      .select('plan')
      .eq('id', ownerId)
      .maybeSingle();
    const plan = (profile as { plan?: string | null } | null)?.plan;
    return typeof plan === 'string' && plan ? plan : null;
  } catch {
    return null;
  }
}

/**
 * The request-scoped decision for the web app: flag rows for the caller's
 * shop + the shop owner's plan, evaluated by evaluateRedlineAiAccess.
 * Fails closed on any infrastructure error, like isEnabled does.
 */
export async function isRedlineAiEnabled(ctx: FlagEvaluationContext): Promise<boolean> {
  try {
    const { getAllFlagRows } = await import('@/lib/featureFlags/featureFlagService');
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const flags = await getAllFlagRows(ctx.shopId);
    const plan = await fetchShopOwnerPlan(getAdminDb(), ctx.shopId);
    return evaluateRedlineAiAccess(flags, ctx, plan);
  } catch {
    return false;
  }
}
