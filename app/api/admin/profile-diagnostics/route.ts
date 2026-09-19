/**
 * GET /api/admin/profile-diagnostics
 * Platform-owner only. Read-only diagnosis of profiles that have no shop
 * membership: aggregate counts by established cause plus a bounded, paginated
 * list of masked rows (one-way reference, day-level dates, booleans). No email,
 * name or identifier is returned, and nothing is linked, changed or deleted.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformOwner, forbidden } from '@/lib/adminAuth';
import { listProfileDiagnostics } from '@/lib/admin/profileDiagnostics';
import { sanitizeError } from '@/lib/apiHelpers';

export async function GET(req: NextRequest) {
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) {
    return auth.email ? forbidden(auth.reason) : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  try {
    const result = await listProfileDiagnostics({
      page: url.searchParams.get('page') ?? undefined,
      pageSize: url.searchParams.get('pageSize') ?? undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err, 'admin/profile-diagnostics') }, { status: 500 });
  }
}
