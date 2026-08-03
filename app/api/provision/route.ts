/**
 * POST /api/provision
 *
 * Ensures the signed-in user has a shop, an owner membership, and a plan.
 *
 * Provisioning used to happen in exactly one place: app/auth/callback, the
 * email-confirmation route. Any path into the app that does not pass through
 * that callback left the user with no shop at all — and because the callback
 * catches provisioning errors so a failure cannot block login, a *failed*
 * provision looked identical to a successful one. The user landed in a working
 * app whose sidebar showed its "My Shop" defaults.
 *
 * That is how a broken shops INSERT went unnoticed until a customer tried to
 * pay: no signup had ever produced a shop, and nothing said so.
 *
 * This route exists so the callback is no longer the only chance. It is
 * idempotent — getOrCreatePrimaryShop returns the existing shop if there is
 * one — so it is safe to call whenever a client notices it has no shop.
 *
 * Unlike the callback, this reports failures. A caller that gets 500 knows the
 * account is unusable, and Sentry says why.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getOrCreatePrimaryShop, ensureInitialPlan } from '@/commercial/onboarding/ShopProvisioningService';
import { alertException } from '@/lib/observability/alerts';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );

  // Bearer token or session cookie — the client may hold either.
  const authHeader = req.headers.get('authorization') ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const { data: { user } } = bearer
    ? await supabase.auth.getUser(bearer)
    : await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const meta = user.user_metadata as { full_name?: string; shop_name?: string } | null;
    const { shopId, created } = await getOrCreatePrimaryShop(user.id, {
      ownerName: meta?.full_name,
      shopName:  meta?.shop_name || 'My Shop',
    });

    await ensureInitialPlan(user.id, shopId);

    if (created) {
      // Not an error, but worth seeing: it means this user reached the app
      // without the auth callback having provisioned them.
      console.warn('[provision] created a shop for a user who had none', JSON.stringify({ userId: user.id }));
    }

    return NextResponse.json({ shopId, created });
  } catch (err) {
    // A user with no shop cannot save a customer, a vehicle or a job — the
    // account is unusable. Loud, unlike the callback.
    alertException('provisioning', err, { userId: user.id, route: 'POST /api/provision' });
    return NextResponse.json({ error: 'Provisioning failed' }, { status: 500 });
  }
}
