/**
 * Server-side flag checks for API routes that act on one shop.
 *
 * Replaces the per-route `isFlagEnabled` copies, which read
 * `.eq('flag_key', key).maybeSingle()`. That query ignores scope entirely: the
 * moment a key had a second row (a shop-scoped override, say), maybeSingle
 * errored, and half the copies treated the error as ENABLED — so adding a
 * shop-only row switched the feature on for every shop on the platform.
 *
 * Here every row for the key is read and resolved by `evaluateFlag`
 * (user > role > shop > environment > global > off), so a shop-scoped row
 * affects that shop only.
 *
 * - Fails CLOSED: any error means "off". A flag that cannot be read must never
 *   turn an experimental feature on (CLAUDE.md: disabled by default).
 * - Uncached, like the copies it replaces: turning a flag off takes effect on
 *   the next request, not after a cache TTL.
 */

import type { FeatureFlag, FlagEvaluationContext } from './types';
import { evaluateFlag } from './featureFlagService';
import { getFeatureFlagEnvironment } from '@/lib/environment';

export interface ShopFlagContext {
  shopId: string;
  userId?: string | null;
  role?: string | null;
}

function toEvaluationContext(ctx: ShopFlagContext): FlagEvaluationContext {
  return {
    shopId: ctx.shopId,
    userId: ctx.userId ?? '',
    role: ctx.role ?? '',
    environment: getFeatureFlagEnvironment(),
  };
}

/** Resolve several flags for one shop with a single query. Missing keys are false. */
export async function resolveShopFlags(
  keys: readonly string[],
  ctx: ShopFlagContext,
): Promise<Record<string, boolean>> {
  const off = Object.fromEntries(keys.map(k => [k, false]));
  if (keys.length === 0 || !ctx.shopId) return off;
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const { data, error } = await getAdminDb()
      .from('feature_flags')
      .select('*')
      .in('flag_key', [...keys]);
    if (error || !data) return off;
    const rows = data as FeatureFlag[];
    const evalCtx = toEvaluationContext(ctx);
    return Object.fromEntries(keys.map(k => [k, evaluateFlag(rows, k, evalCtx)]));
  } catch {
    return off;
  }
}

/** Whether one flag is on for this shop. False on any error. */
export async function isShopFlagEnabled(key: string, ctx: ShopFlagContext): Promise<boolean> {
  const flags = await resolveShopFlags([key], ctx);
  return flags[key] === true;
}
