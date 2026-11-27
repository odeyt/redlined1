/**
 * Who may use the AI pilot. Server-only.
 *
 * Owner decision (2026-11-27): D1 Imports' own shops only, never paying
 * customers. Two independent gates, both required:
 *   1. the shop is one of INTERNAL_SHOP_IDS (code, not a setting), and
 *   2. the `ai_translation` flag evaluates ON for the caller.
 * So even a flag switched on globally from Settings cannot reach another
 * tenant's shop.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { INTERNAL_SHOP_IDS } from '@/lib/demo-seed/guards';
import { resolveRequestShop } from '@/lib/shops/requestShop';
import { isEnabled } from '@/lib/featureFlags/featureFlagService';
import { getFeatureFlagEnvironment } from '@/lib/environment';

export const AI_TRANSLATION_FLAG = 'ai_translation';

export function isInternalShop(shopId: string): boolean {
  return INTERNAL_SHOP_IDS.includes(shopId);
}

export type GateResult =
  | { ok: true; userId: string; shopId: string; role: string }
  | { ok: false; status: number; reason: 'unauthorized' | 'no_shop' | 'not_internal' | 'flag_off' };

export async function aiGate(req: NextRequest, allowedRoles?: readonly string[]): Promise<GateResult> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, reason: 'unauthorized' };

  const membership = await resolveRequestShop(supabase, user.id, req.headers.get('x-shop-id'), allowedRoles);
  if (!membership) return { ok: false, status: 403, reason: 'no_shop' };
  if (!isInternalShop(membership.shop_id)) return { ok: false, status: 403, reason: 'not_internal' };

  const on = await isEnabled(AI_TRANSLATION_FLAG, {
    userId: user.id, shopId: membership.shop_id, role: membership.role, environment: getFeatureFlagEnvironment(),
  });
  if (!on) return { ok: false, status: 200, reason: 'flag_off' };

  return { ok: true, userId: user.id, shopId: membership.shop_id, role: membership.role };
}
