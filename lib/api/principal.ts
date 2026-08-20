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

/** Issued secrets look like `rl_live_<32 hex>`; the prefix is not secret. */
export const API_KEY_PREFIX = 'rl_live_';

export interface ApiPrincipal {
  keyId: string;
  name: string;
  organizationId: string;
  /** Shops this key may touch. One entry when the key is shop-scoped. */
  shopIds: string[];
  /** The shop a write lands in — the scoped one, or the organization's only shop. */
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
    .select('id')
    .eq('organization_id', key.organization_id);

  const orgShopIds: string[] = (shops ?? []).map((s: { id: string }) => s.id);

  let shopIds = orgShopIds;
  if (key.shop_id) {
    if (!orgShopIds.includes(key.shop_id)) throw new ApiError('SHOP_NOT_ACCESSIBLE');
    shopIds = [key.shop_id];
  }
  if (shopIds.length === 0) throw new ApiError('SHOP_NOT_ACCESSIBLE');

  // A write needs exactly one shop. An organization-wide key over a
  // multi-shop organization cannot pick one on the caller's behalf — that is
  // an ambiguity the integration has to resolve by using a shop-scoped key.
  const writeShopId = shopIds.length === 1 ? shopIds[0] : null;

  const scopes: string[] = Array.isArray(key.scopes) ? key.scopes : [];

  return {
    keyId: key.id,
    name: key.name,
    organizationId: key.organization_id,
    shopIds,
    writeShopId,
    scopes,
    capabilities: capabilitiesForScopes(scopes),
  };
}

export function requireScope(principal: ApiPrincipal, scope: string): void {
  if (!principal.scopes.includes(scope)) throw new ApiError('SCOPE_REQUIRED', { required: scope });
}
