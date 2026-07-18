import { NextRequest, NextResponse } from 'next/server';
import { requireShopRole, isLastOwner } from '@/lib/serverAuth';
import { createServerSupabase } from '@/lib/supabase-server';
import { parseJsonBody, sanitizeError } from '@/lib/apiHelpers';
import { MemberDeleteSchema, ShopIdSchema } from '@/lib/schemas';

/**
 * DELETE /api/members — remove a staff member from a shop.
 * GET /api/members — list a shop's staff roster.
 *
 * Caller: must be authenticated via a valid Supabase bearer token.
 * Resource authorized: the `shopId` query param (GET) or body field
 *   (DELETE) — resolved to the caller's own shop_users membership row. The
 *   operation applies ONLY to that explicit shopId; there is no propagation
 *   to other shops the caller may co-own (see CRITICAL 2 in the security
 *   review this fixes).
 * Required role: owner for DELETE (removal is a destructive, privileged
 *   action); any shop member (owner/manager/advisor/technician) for GET
 *   (viewing the roster is not privileged).
 * Treated only as a resource identifier (never as proof of caller identity):
 *   `userId` (whose membership row is being deleted), `shopId`.
 * Cross-shop access prevention: requireShopRole() checks the caller's own
 *   membership in exactly this shopId; a caller cannot remove members of, or
 *   list the roster of, a shop they don't belong to.
 */
export async function DELETE(req: NextRequest) {
  const parsed = await parseJsonBody(req, MemberDeleteSchema);
  if (!parsed.ok) return parsed.response;
  const { userId, shopId } = parsed.data;

  const auth = await requireShopRole(req, shopId, ['owner']);
  if (!auth.ok) return auth.response;

  const admin = createServerSupabase();

  const { data: currentRow, error: lookupError } = await admin
    .from('shop_users')
    .select('role')
    .eq('shop_id', shopId)
    .eq('user_id', userId)
    .maybeSingle();
  if (lookupError) {
    return NextResponse.json({ error: sanitizeError(lookupError, 'members:DELETE lookup', 'Unable to remove member') }, { status: 500 });
  }
  if (!currentRow) {
    return NextResponse.json({ error: 'Member not found in this shop' }, { status: 404 });
  }

  if (currentRow.role === 'owner' && (await isLastOwner(shopId, userId))) {
    return NextResponse.json({ error: 'Cannot remove the last owner of a shop' }, { status: 409 });
  }

  // Applies ONLY to this explicit shopId — no cross-shop propagation.
  const { error: deleteError } = await admin
    .from('shop_users')
    .delete()
    .eq('shop_id', shopId)
    .eq('user_id', userId);
  if (deleteError) {
    return NextResponse.json({ error: sanitizeError(deleteError, 'members:DELETE delete', 'Unable to remove member') }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest) {
  const shopIdRaw = req.nextUrl.searchParams.get('shopId');
  const shopIdCheck = ShopIdSchema.safeParse(shopIdRaw);
  if (!shopIdCheck.success) return NextResponse.json({ error: 'Missing or invalid shopId' }, { status: 400 });
  const shopId = shopIdCheck.data;

  const auth = await requireShopRole(req, shopId);
  if (!auth.ok) return auth.response;

  const admin = createServerSupabase();

  const { data: rows, error: rowsErr } = await admin
    .from('shop_users')
    .select('user_id, role')
    .eq('shop_id', shopId);
  if (rowsErr) return NextResponse.json({ error: sanitizeError(rowsErr, 'members:GET rows', 'Unable to load roster') }, { status: 500 });
  if (!rows || rows.length === 0) return NextResponse.json({ members: [] });

  const userIds = rows.map((r: Record<string, unknown>) => r.user_id as string);

  // Bounded identity lookup — replaces the previous listUsers({ perPage: 1000 })
  // whole-project scan. profiles.email covers the common case (kept in sync
  // by the on_auth_user_created trigger and by app/api/invite's own upsert);
  // any id it doesn't cover falls back to a per-id getUserById call, bounded
  // by the size of this shop's own roster, never a global scan.
  const { data: profileRows } = await admin.from('profiles').select('id, email').in('id', userIds);
  const emailMap = new Map<string, string>((profileRows ?? []).map((p: { id: string; email: string | null }) => [p.id, p.email ?? '']));

  const missingIds = userIds.filter((id) => !emailMap.get(id));
  if (missingIds.length > 0) {
    const fetched = await Promise.all(missingIds.map((id) => admin.auth.admin.getUserById(id)));
    fetched.forEach((result, i) => {
      if (result.data?.user?.email) emailMap.set(missingIds[i], result.data.user.email);
    });
  }

  return NextResponse.json({
    members: rows.map((r: Record<string, unknown>) => ({
      userId: r.user_id as string,
      email: emailMap.get(r.user_id as string) ?? '',
      role: r.role as string,
    })),
  });
}
