/**
 * Feature-flag gates for API v1 endpoints.
 *
 * An endpoint behind a flag answers 404 NOT_FOUND while the flag is off, the
 * same as a route that does not exist, so an integration cannot tell a
 * disabled feature from a missing one.
 *
 * Read fresh on every request, deliberately NOT through featureFlagService's
 * five-minute cache. This flag is the off switch for machine writes to
 * production, and an off switch that takes five minutes, per server instance,
 * to take effect is not one.
 *
 * Fail closed: no row, a read error or an exception all mean off.
 */
import { evaluateFlag } from '@/lib/featureFlags/featureFlagService';
import { getFeatureFlagEnvironment } from '@/lib/environment';
import type { FeatureFlag } from '@/lib/featureFlags/types';

/** The flags an API route may be gated on. Adding one is a reviewed change. */
export const API_FLAGS = ['api_v1_documents'] as const;
export type ApiFlag = typeof API_FLAGS[number];

/**
 * Whether the flag is on for EVERY shop the key covers.
 *
 * An organization-wide key spans several shops. If the flag is on for one and
 * off for another, the endpoint stays off: a key must not reach a shop's
 * documents because some other shop opted in.
 *
 * User rows are ignored and the role is 'api_key', so only shop, environment
 * and global rows can apply (and a role row for 'api_key', if one is ever
 * written on purpose).
 */
export function apiFlagOnForShops(
  rows: readonly FeatureFlag[],
  flag: ApiFlag,
  shopIds: readonly string[],
  environment: ReturnType<typeof getFeatureFlagEnvironment>,
): boolean {
  if (shopIds.length === 0) return false;
  // A key is not a user. Dropping user rows outright, rather than relying on
  // an empty userId never matching, means a user row saved with a blank
  // user_id cannot switch the API on.
  const applicable = rows.filter(r => r.scope !== 'user');
  return shopIds.every(shopId =>
    evaluateFlag(applicable, flag, { userId: '', role: 'api_key', shopId, environment }),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export async function isApiFlagOn(db: Db, flag: ApiFlag, shopIds: readonly string[]): Promise<boolean> {
  try {
    const { data, error } = await db.from('feature_flags').select('*').eq('flag_key', flag);
    if (error || !Array.isArray(data)) return false;
    return apiFlagOnForShops(data as FeatureFlag[], flag, shopIds, getFeatureFlagEnvironment());
  } catch {
    return false;
  }
}
