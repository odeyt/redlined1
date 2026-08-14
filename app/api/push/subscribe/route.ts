/**
 * POST /api/push/subscribe — register this device to receive push.
 *
 * Caller: any authenticated member of the shop. Unlike most routes here there
 * is no role requirement — a technician registering their own phone is the
 * main use, and receiving your own alerts needs no privilege.
 *
 * The critical detail: user_id comes from the VERIFIED session, never from the
 * request body. A body-supplied user_id would let anyone register a device
 * against a colleague's account and receive their alerts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireShopRole, ALL_SHOP_ROLES } from '@/lib/serverAuth';
import { createServerSupabase } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  let body: {
    shopId?: string; endpoint?: string; p256dh?: string; auth?: string; userAgent?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { shopId, endpoint, p256dh, auth, userAgent } = body;
  if (!shopId || !endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Missing subscription details' }, { status: 400 });
  }

  // Confirms the caller is a member of this shop and gives us their verified
  // user id. shopId from the body is only a resource identifier — it is
  // checked against the caller's own membership, never trusted.
  const authorized = await requireShopRole(req, shopId, [...ALL_SHOP_ROLES]);
  if (!authorized.ok) return authorized.response;

  const admin = createServerSupabase();
  const { error } = await admin
    .from('push_subscriptions')
    .upsert({
      user_id: authorized.context.userId,
      shop_id: shopId,
      endpoint,
      p256dh,
      auth,
      user_agent: userAgent ?? null,
      last_used_at: null,
    }, { onConflict: 'endpoint' });

  if (error) {
    console.error('[push] could not save subscription:', error.message);
    return NextResponse.json({ error: 'Could not register this device' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
