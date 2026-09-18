/**
 * GET /api/admin/accounts/[id]
 * Platform-owner only. Read-only account/shop detail. [id] is shops.id —
 * the account directory's one canonical identifier (see lib/admin/accountsData.ts).
 * Never returns raw webhook payloads, secrets, or full unmasked provider IDs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyPlatformOwner, forbidden } from '@/lib/adminAuth';
import { getAccountDetail } from '@/lib/admin/accountsData';
import { sanitizeError } from '@/lib/apiHelpers';

const ShopIdSchema = z.string().trim().uuid('Invalid account id');

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) {
    return auth.email ? forbidden(auth.reason) : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const parsed = ShopIdSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid account id' }, { status: 400 });
  }

  try {
    const detail = await getAccountDetail(parsed.data);
    if (!detail) return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    return NextResponse.json({ account: detail });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err, 'admin/accounts/[id]') }, { status: 500 });
  }
}
