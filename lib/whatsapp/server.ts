/**
 * Server wiring for the /api/whatsapp/* routes: the access guard every route
 * runs first, and the real dependencies for the send service.
 *
 * Access = all of:
 *   1. a valid session and a role in `shopId` (requireShopRole),
 *   2. `shopId` is on the pilot allowlist (D1 Imports only),
 *   3. the `whatsapp_business` feature flag is on for that shop/role/user,
 *   4. the shop is entitled (internal D1 shops always are; plans/add-on are
 *      prepared but no other shop can pass gate 2 yet).
 * Every refusal is the same 404-shaped "not available" so the integration's
 * existence is not advertised to other tenants.
 */
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopRole, type ShopRole, type AuthorizedContext } from '@/lib/serverAuth';
import { createServerSupabase } from '@/lib/supabase-server';
import { isEnabled, getCurrentEnvironment } from '@/lib/featureFlags/featureFlagService';
import { mergedShopScope } from '@/lib/shops/mergedScope';
import { getOrCreatePortalToken } from '@/lib/portal/portalToken';
import { resolveWhatsAppEntitlement } from '@/config/whatsappEntitlements';
import { D1_ARCHIVED_SHOP_ID, D1_MERGED_SHOP_ID, WHATSAPP_FLAG_KEY, isWhatsAppPilotShop, liveSendingEnvEnabled, transportMode } from './config';
import { createCloudTransport, createMockTransport, type WhatsAppTransport } from './cloudApi';
import { decryptToken } from './tokenCrypto';
import type { SendDeps } from './sendService';

export const NO_STORE = { 'Cache-Control': 'private, no-store' };

const INTERNAL_SHOPS = new Set([D1_MERGED_SHOP_ID, D1_ARCHIVED_SHOP_ID]);

export type WhatsAppAccess =
  | { ok: true; context: AuthorizedContext; shopId: string }
  | { ok: false; response: NextResponse };

export function notAvailable(): NextResponse {
  return NextResponse.json({ error: 'WhatsApp Business is not available for this shop.' }, { status: 404, headers: NO_STORE });
}

export async function requireWhatsAppAccess(req: NextRequest, shopId: unknown, roles: readonly ShopRole[]): Promise<WhatsAppAccess> {
  const auth = await requireShopRole(req, shopId, roles);
  if (!auth.ok) return auth;
  const id = shopId as string;
  if (!isWhatsAppPilotShop(id)) return { ok: false, response: notAvailable() };

  const flagOn = await isEnabled(WHATSAPP_FLAG_KEY, {
    userId: auth.context.userId, shopId: id, role: auth.context.role, environment: getCurrentEnvironment(),
  });
  if (!flagOn) return { ok: false, response: notAvailable() };

  const ent = resolveWhatsAppEntitlement({ internal: INTERNAL_SHOPS.has(id), planId: null });
  if (!ent.entitled) return { ok: false, response: notAvailable() };

  return { ok: true, context: auth.context, shopId: id };
}

let mockTransport: WhatsAppTransport | null = null;
export function transport(): WhatsAppTransport {
  // Mock (local development only): phone number ids starting with 9 behave
  // like a WhatsApp Business App number in coexistence; others like Meta's
  // test number.
  if (transportMode() === 'mock') return (mockTransport ??= createMockTransport({ isOnBizApp: id => id.startsWith('9') }));
  return createCloudTransport();
}

export function adminDb() {
  return createServerSupabase();
}

export function sendDeps(db = adminDb()): SendDeps {
  return {
    db,
    transport: transport(),
    decryptToken,
    portalToken: (customerId: string) => getOrCreatePortalToken(db, customerId),
    scope: (shopId: string) => mergedShopScope(db, shopId),
    shopName: async (shopId: string) => {
      try {
        const [{ data: s }, { data: shop }] = await Promise.all([
          db.from('shop_settings').select('company_name').eq('shop_id', shopId).maybeSingle(),
          db.from('shops').select('name').eq('id', shopId).maybeSingle(),
        ]);
        return (s?.company_name as string) || (shop?.name as string) || 'D1 Imports';
      } catch {
        return 'D1 Imports';
      }
    },
    liveSendingEnv: liveSendingEnvEnabled(),
  };
}
