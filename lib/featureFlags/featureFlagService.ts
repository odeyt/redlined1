/**
 * Server-side feature flag service.
 * Used in API routes and server components only.
 * Client-side evaluation goes through /api/feature-flags → FeatureFlagProvider.
 */

import type { FeatureFlag, FlagEvaluationContext, FlagMap } from './types';

// ── In-memory cache ───────────────────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  flags: FeatureFlag[];
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry>();

function cacheKey(shopId: string): string {
  return `shop:${shopId}`;
}

function getCached(shopId: string): FeatureFlag[] | null {
  const entry = _cache.get(cacheKey(shopId));
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.flags;
}

function setCache(shopId: string, flags: FeatureFlag[]): void {
  _cache.set(cacheKey(shopId), { flags, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateCache(shopId?: string): void {
  if (shopId) {
    _cache.delete(cacheKey(shopId));
  } else {
    _cache.clear();
  }
}

// ── DB fetch ──────────────────────────────────────────────────────────────────

async function fetchFlags(shopId: string): Promise<FeatureFlag[]> {
  const cached = getCached(shopId);
  if (cached) return cached;

  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const { data, error } = await db
      .from('feature_flags')
      .select('*')
      .order('flag_key');

    if (error) {
      // Table may not exist yet (migration not run) — fail open with empty list
      if (error.message?.includes('does not exist')) return [];
      console.error('[FeatureFlags] fetch error:', error.message);
      return [];
    }

    const flags = (data ?? []) as FeatureFlag[];
    setCache(shopId, flags);
    return flags;
  } catch (e) {
    console.error('[FeatureFlags] unexpected error:', e);
    return [];
  }
}

// ── Evaluation ────────────────────────────────────────────────────────────────

/**
 * Evaluation priority (highest wins):
 *   1. user-specific
 *   2. role-specific
 *   3. shop-specific
 *   4. environment-specific
 *   5. global
 *   6. default → false
 */
export function evaluateFlag(flags: FeatureFlag[], key: string, ctx: FlagEvaluationContext): boolean {
  const rows = flags.filter(f => f.flag_key === key);
  if (rows.length === 0) return false;

  const findEnabled = (pred: (f: FeatureFlag) => boolean): boolean | null => {
    const match = rows.find(pred);
    return match ? match.enabled : null;
  };

  // 1. User-specific
  const userResult = findEnabled(f => f.scope === 'user' && f.user_id === ctx.userId);
  if (userResult !== null) return userResult;

  // 2. Role-specific
  const roleResult = findEnabled(f => f.scope === 'role' && f.role === ctx.role);
  if (roleResult !== null) return roleResult;

  // 3. Shop-specific
  const shopResult = findEnabled(f => f.scope === 'shop' && f.shop_id === ctx.shopId);
  if (shopResult !== null) return shopResult;

  // 4. Environment-specific
  const envResult = findEnabled(f => f.scope === 'environment' && f.environment === ctx.environment);
  if (envResult !== null) return envResult;

  // 5. Global
  const globalResult = findEnabled(f => f.scope === 'global');
  if (globalResult !== null) return globalResult;

  return false;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function isEnabled(key: string, ctx: FlagEvaluationContext): Promise<boolean> {
  try {
    const flags = await fetchFlags(ctx.shopId);
    return evaluateFlag(flags, key, ctx);
  } catch {
    return false; // Never block the app
  }
}

export async function getFlags(ctx: FlagEvaluationContext): Promise<FlagMap> {
  try {
    const flags = await fetchFlags(ctx.shopId);
    const keys = [...new Set(flags.map(f => f.flag_key))];
    return Object.fromEntries(keys.map(k => [k, evaluateFlag(flags, k, ctx)]));
  } catch {
    return {};
  }
}

export async function getAllFlagRows(shopId: string): Promise<FeatureFlag[]> {
  return fetchFlags(shopId);
}

export async function enableFlag(
  key: string,
  scope: FeatureFlag['scope'],
  opts: { shopId?: string; userId?: string; role?: string; environment?: string } = {}
): Promise<void> {
  await upsertFlag(key, true, scope, opts);
}

export async function disableFlag(
  key: string,
  scope: FeatureFlag['scope'],
  opts: { shopId?: string; userId?: string; role?: string; environment?: string } = {}
): Promise<void> {
  await upsertFlag(key, false, scope, opts);
}

async function upsertFlag(
  key: string,
  enabled: boolean,
  scope: FeatureFlag['scope'],
  opts: { shopId?: string; userId?: string; role?: string; environment?: string }
): Promise<void> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();

    await db.from('feature_flags').upsert({
      flag_key:    key,
      enabled,
      scope,
      shop_id:     opts.shopId     ?? null,
      user_id:     opts.userId     ?? null,
      role:        opts.role       ?? null,
      environment: opts.environment ?? null,
    }, {
      onConflict: 'flag_key,scope,shop_id,user_id,role,environment',
      ignoreDuplicates: false,
    });

    invalidateCache(opts.shopId);
  } catch (e) {
    console.error('[FeatureFlags] upsert error:', e);
  }
}

export function getCurrentEnvironment(): 'production' | 'staging' | 'development' {
  const env = process.env.NODE_ENV;
  if (env === 'production') return 'production';
  if (process.env.VERCEL_ENV === 'preview') return 'staging';
  return 'development';
}
