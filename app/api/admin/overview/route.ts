/**
 * GET /api/admin/overview
 * Platform-owner only. Signup/account counts for the owner overview page.
 * Read-only. Never modifies account or billing state.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformOwner, forbidden } from '@/lib/adminAuth';
import { getOwnerOverview } from '@/lib/admin/accountsData';
import { sanitizeError } from '@/lib/apiHelpers';

export async function GET(req: NextRequest) {
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) {
    return auth.email ? forbidden(auth.reason) : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const overview = await getOwnerOverview();
    return NextResponse.json({ overview });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err, 'admin/overview') }, { status: 500 });
  }
}
