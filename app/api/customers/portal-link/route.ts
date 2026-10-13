/**
 * POST /api/customers/portal-link — the portal link for ONE customer, for
 * staff of that customer's shop.
 *
 * Portal tokens are kept out of the customers table so they are never in a
 * staff list response. Staff fetch a link only when they ask for it, here.
 *
 * Body: { shopId, customerId }. The caller must hold an owner/manager/advisor
 * role in `shopId` (their active shop) AND in the customer's own shop — with
 * mirrored shops those can differ. Session-gated by proxy.ts as well.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireShopRole, type ShopRole } from '@/lib/serverAuth';
import { getAdminDb } from '@/lib/supabaseServer';
import { getOrCreatePortalToken, logPortalLookupError } from '@/lib/portal/portalToken';

export const dynamic = 'force-dynamic';

const LINK_ROLES: readonly ShopRole[] = ['owner', 'manager', 'advisor'];
const HEADERS = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };

export async function POST(req: NextRequest) {
  let body: { shopId?: unknown; customerId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: HEADERS });
  }

  const auth = await requireShopRole(req, body.shopId, LINK_ROLES);
  if (!auth.ok) return auth.response;

  const customerId = typeof body.customerId === 'string' ? body.customerId.trim() : '';
  if (!customerId || customerId.length > 100) {
    return NextResponse.json({ error: 'Customer not found.' }, { status: 404, headers: HEADERS });
  }

  try {
    const db = getAdminDb();
    const { data: customer, error } = await db
      .from('customers')
      .select('id, shop_id')
      .eq('id', customerId)
      .maybeSingle();
    if (error) throw error;
    if (!customer?.shop_id) {
      return NextResponse.json({ error: 'Customer not found.' }, { status: 404, headers: HEADERS });
    }
    if (customer.shop_id !== body.shopId) {
      const own = await requireShopRole(req, customer.shop_id, LINK_ROLES);
      if (!own.ok) return NextResponse.json({ error: 'Customer not found.' }, { status: 404, headers: HEADERS });
    }

    const token = await getOrCreatePortalToken(db, customer.id as string);
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || req.nextUrl.origin;
    return NextResponse.json({ url: `${origin}/portal/${token}` }, { headers: HEADERS });
  } catch (e) {
    logPortalLookupError('portal-link', e);
    return NextResponse.json({ error: 'Could not create the portal link.' }, { status: 500, headers: HEADERS });
  }
}
