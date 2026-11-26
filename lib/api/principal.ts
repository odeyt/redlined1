/**
 * Turning a bearer credential into a tenant.
 *
 * The whole security model of API v1 rests on one sentence: **the key is the
 * tenant**. Nothing a caller sends — no body field, no query parameter, no
 * header — can change which organization or shop it is operating on. If a
 * request wants a different tenant it needs a different key.
 *
 * That is why `resolvePrincipal` returns the organization and the permitted
 * shops, and why the route handlers never read `organization_id` or `shop_id`
 * from input.
 */
import { createHash, timingSafeEqual } from 'crypto';
import { ApiError } from './errors';
import { capabilitiesForScopes } from './scopes';
import { mergedShopScope } from '@/lib/shops/mergedScope';

/** Issued secrets look like `rl_live_<32 hex>`; the prefix is not secret. */
export const API_KEY_PREFIX = 'rl_live_';

export interface ApiPrincipal {
  keyId: string;
  name: string;
  organizationId: string;
  /**
   * Shops this key may READ: its own shops plus any closed location merged
   * into one of them (see `mergedShopIds`). Every domain read is scoped by
   * this list.
   */
  shopIds: string[];
  /** The key's own shops: the scoped shop, or every shop in the organization. */
  ownShopIds: string[];
  /** `ownShopIds` that are not archived. Feature flags are evaluated on these. */
  activeShopIds: string[];
  /**
   * Archived shops merged into one of the key's active shops: mirrored in
   * both directions, archived, and in the key's organization (the rule in
   * lib/shops/mergedScope.ts, plus the organization check). Read-only scope:
   * D1 Imports' history inside Location 2 is the case this exists for.
   */
  mergedShopIds: string[];
  /** The shop a write lands in: the key's only ACTIVE shop. Never an archived one. */
  writeShopId: string | null;
  scopes: string[];
  capabilities: string[];
}

export function hashApiKey(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/**
 * Compare two hex digests without leaking where they diverge.
 *
 * The lookup below is by hash equality in the database, which already avoids a
 * timing channel; this exists for the paths that compare in application code,
 * so nobody reintroduces `a === b` on a secret later.
 */
export function secureEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** The `Authorization: Bearer …` value, or null. Never logged. */
export function bearerFrom(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Authenticate a credential and derive its tenant.
 *
 * Throws ApiError rather than returning a discriminated union, so a route that
 * forgets to check cannot proceed unauthenticated.
 */
export async function resolvePrincipal(db: Db, authorization: string | null): Promise<ApiPrincipal> {
  const secret = bearerFrom(authorization);
  if (!secret) throw new ApiError('AUTH_REQUIRED');

  // Shape-check before touching the database: a malformed credential should
  // not cost a query, and it must not be distinguishable in timing from a
  // well-formed one that does not exist.
  if (!secret.startsWith(API_KEY_PREFIX)) throw new ApiError('INVALID_API_KEY');

  const { data: key, error } = await db
    .from('api_keys')
    .select('id, name, organization_id, shop_id, scopes, revoked_at')
    .eq('key_hash', hashApiKey(secret))
    .maybeSingle();

  if (error) throw new ApiError('INTERNAL_ERROR');
  if (!key) throw new ApiError('INVALID_API_KEY');
  if (key.revoked_at) throw new ApiError('API_KEY_REVOKED');

  // Shops are read from the organization, never from the request. A key
  // narrowed to one shop is additionally checked to belong to that
  // organization — a shop moved or deleted since issuance must not linger.
  const { data: shops } = await db
    .from('shops')
    .select('id, archived_at')
    .eq('organization_id', key.organization_id);

  const orgShops = (shops ?? []) as { id: string; archived_at: string | null }[];
  const orgShopIds: string[] = orgShops.map(s => s.id);
  const archived = new Set(orgShops.filter(s => s.archived_at).map(s => s.id));

  let ownShopIds = orgShopIds;
  if (key.shop_id) {
    if (!orgShopIds.includes(key.shop_id)) throw new ApiError('SHOP_NOT_ACCESSIBLE');
    ownShopIds = [key.shop_id];
  }
  if (ownShopIds.length === 0) throw new ApiError('SHOP_NOT_ACCESSIBLE');

  const activeShopIds = ownShopIds.filter(id => !archived.has(id));

  // A write needs exactly one shop, and never an archived one: a closed
  // location takes no new records. An organization-wide key whose
  // organization has one open shop (D1 Imports after the merge) writes there;
  // over several open shops it cannot pick, and the integration has to use a
  // shop-scoped key.
  const writeShopId = activeShopIds.length === 1 ? activeShopIds[0] : null;

  // Closed locations merged into the key's open shops are read as part of
  // them, the way the staff app reads them through the mirror. The rule is
  // mergedShopScope's (mirrored both ways AND archived), plus: same
  // organization as the key. Never wider: mergedShopScope fails closed to
  // the shop alone, and a live sister location is never archived.
  const merged = new Set<string>();
  for (const shopId of activeShopIds) {
    for (const id of await mergedShopScope(db, shopId)) {
      if (id !== shopId && orgShopIds.includes(id) && archived.has(id)) merged.add(id);
    }
  }
  const mergedShopIds = [...merged].filter(id => !ownShopIds.includes(id)).sort();
  const shopIds = [...ownShopIds, ...mergedShopIds];

  const scopes: string[] = Array.isArray(key.scopes) ? key.scopes : [];

  return {
    keyId: key.id,
    name: key.name,
    organizationId: key.organization_id,
    shopIds,
    ownShopIds,
    activeShopIds,
    mergedShopIds,
    writeShopId,
    scopes,
    capabilities: capabilitiesForScopes(scopes),
  };
}

export function requireScope(principal: ApiPrincipal, scope: string): void {
  if (!principal.scopes.includes(scope)) throw new ApiError('SCOPE_REQUIRED', { required: scope });
}
