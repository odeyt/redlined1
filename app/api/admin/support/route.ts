/**
 * GET /api/admin/support
 * Platform-owner only. Unified read-only feed of support tickets and
 * shop-audit leads. Never includes message bodies or free-text lead fields —
 * see lib/admin/supportData.ts for the exact shape.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformOwner, forbidden } from '@/lib/adminAuth';
import { listSupportItems } from '@/lib/admin/supportData';
import { sanitizeError } from '@/lib/apiHelpers';

export async function GET(req: NextRequest) {
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) {
    return auth.email ? forbidden(auth.reason) : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await listSupportItems();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err, 'admin/support') }, { status: 500 });
  }
}
