import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { loadShopIdentity } from '@/lib/shops/shopIdentityServer';

/**
 * GET /api/shop/identity?shopId=… — is this shop able to issue a document?
 *
 * The activation card reads this. It is NOT the enforcement point: the
 * document routes call `loadShopIdentity` themselves, so hiding the card in
 * the browser can never be what permits a send. This endpoint exists so the UI
 * asks the same question the server will answer, rather than re-deriving it
 * from a settings object the client happens to hold — which is how three
 * surfaces ended up with three different fallbacks.
 *
 * Membership is required. Readiness names which fields a shop is missing, and
 * that is a small but real disclosure about another business; it is not for
 * anyone who merely has a session.
 */
export async function GET(req: NextRequest) {
  const shopId = req.nextUrl.searchParams.get('shopId') ?? '';
  if (!shopId) {
    return NextResponse.json({ error: 'shopId is required.' }, { status: 422 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
  }

  const { data: membership } = await supabase
    .from('shop_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('shop_id', shopId)
    .maybeSingle();

  if (!membership) {
    // Same answer for "not signed in" and "not a member of that shop": a
    // caller probing shop ids learns nothing from the difference.
    return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
  }

  const readiness = await loadShopIdentity(shopId);

  /**
   * The role travels with the answer so the client can decide whether to offer
   * the fix or merely explain it. A technician sees why a document is blocked;
   * they are not shown a button that would fail.
   */
  return NextResponse.json({
    ...readiness,
    role: (membership as { role?: string }).role ?? '',
  });
}
