/**
 * Server-only authorization helper for Route Handlers under app/api/**.
 *
 * Verifies the caller's Supabase-issued bearer token and confirms the
 * authenticated user is a member of the shop being acted on, with a
 * sufficient role. This is the single source of truth for "is this caller
 * allowed to touch this shop's data" — routes must call requireShopRole()
 * before performing any mutation or privileged read, and must never treat
 * a shopId/userId/role/ownerId/email value from the request body as proof
 * of who the caller is or what they're allowed to do. Those values are only
 * ever resource identifiers to check the verified caller against.
 *
 * Import this ONLY in Route Handlers (server-side). Never import it in
 * client components — it uses the service-role key via createServerSupabase().
 */
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { capabilitiesFor, type CapabilityOverrides } from '@/lib/auth/capabilities';

export type ShopRole = 'owner' | 'manager' | 'advisor' | 'technician';

export const ALL_SHOP_ROLES: readonly ShopRole[] = ['owner', 'manager', 'advisor', 'technician'];

export type AuthorizedContext = {
  userId: string;
  role: ShopRole;
};

export type AuthorizationResult =
  | { ok: true; context: AuthorizedContext }
  | { ok: false; response: NextResponse };

function unauthorized(message = 'Unauthorized'): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

function forbidden(message = 'Forbidden'): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

function badRequest(message = 'Bad request'): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

function extractBearerToken(req: NextRequest): string {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

/**
 * Confirms the request carries a valid, non-expired Supabase JWT AND that
 * the resulting user is a shop_users member of `shopId` with a role in
 * `allowedRoles`. Returns a ready-to-return NextResponse on any failure —
 * callers should `if (!result.ok) return result.response;` immediately.
 *
 * shopId is treated purely as a resource identifier: it is never trusted as
 * proof of anything by itself, it is only the key used to look up the
 * verified caller's own membership row.
 *
 * Failure responses are deliberately uniform (403 Forbidden) for both
 * "shop doesn't exist" and "user isn't a member of it" / "role too low",
 * so callers cannot use this endpoint to enumerate valid shop IDs.
 */
export async function requireShopRole(
  req: NextRequest,
  shopId: unknown,
  allowedRoles: readonly ShopRole[] = ALL_SHOP_ROLES,
): Promise<AuthorizationResult> {
  if (!shopId || typeof shopId !== 'string') {
    return { ok: false, response: badRequest('Missing or invalid shopId') };
  }

  const token = extractBearerToken(req);
  if (!token) {
    return { ok: false, response: unauthorized('Missing bearer token') };
  }

  const admin = createServerSupabase();

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    return { ok: false, response: unauthorized('Invalid or expired token') };
  }
  const userId = userData.user.id;

  const { data: membership, error: membershipError } = await admin
    .from('shop_users')
    .select('role')
    .eq('shop_id', shopId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipError || !membership) {
    return { ok: false, response: forbidden('Not a member of this shop') };
  }

  const role = membership.role as ShopRole;
  if (!allowedRoles.includes(role)) {
    return { ok: false, response: forbidden('Insufficient role for this action') };
  }

  return { ok: true, context: { userId, role } };
}

/**
 * True if `userId` is the shop's only owner (i.e. demoting or removing them
 * would leave the shop with zero owners). Fails safe: a lookup error is
 * treated as "yes, this would remove the last owner" so the caller blocks
 * the action rather than risk an ownerless shop.
 */
export async function isLastOwner(shopId: string, userId: string): Promise<boolean> {
  const admin = createServerSupabase();
  const { data, error } = await admin
    .from('shop_users')
    .select('user_id')
    .eq('shop_id', shopId)
    .eq('role', 'owner');
  if (error) return true;
  const otherOwners = (data ?? []).filter((row) => (row as { user_id: string }).user_id !== userId);
  return otherOwners.length === 0;
}

/**
 * Confirms the caller is a member of the shop AND holds a capability.
 *
 * The successor to `requireShopRole(req, shopId, ['owner','manager'])`. A role
 * list at the call site is a permission model scattered across 101 route
 * handlers: to answer "who can read the audit trail" you have to grep. A
 * capability is one name, defined once, and a shop can adjust it without a
 * deploy.
 *
 * Same failure shape as requireShopRole, deliberately: uniform 403s, so this
 * cannot be used to discover which capabilities exist or which shops are real.
 */
export async function requireCapability(
  req: NextRequest,
  shopId: unknown,
  capability: string,
): Promise<AuthorizationResult> {
  const membership = await requireShopRole(req, shopId);
  if (!membership.ok) return membership;

  const admin = createServerSupabase();
  // Overrides are read server-side rather than accepted from the request. A
  // client that could supply its own overrides could grant itself anything.
  const { data: settings } = await admin
    .from('shop_settings')
    .select('capability_overrides')
    .eq('shop_id', shopId as string)
    .maybeSingle();

  const capabilities = capabilitiesFor(
    membership.context.role,
    (settings?.capability_overrides as CapabilityOverrides) ?? null,
  );

  if (!capabilities.includes(capability)) {
    return { ok: false, response: forbidden('Insufficient permission for this action') };
  }
  return membership;
}
