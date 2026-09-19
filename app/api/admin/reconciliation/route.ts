/**
 * GET /api/admin/reconciliation
 * Platform-owner only. Read-only list of accounts whose billing fields do not
 * reconcile (paid access with no subscription row, an active subscription on a
 * free entitlement, billing events with no subscription row, conflicting
 * statuses). Never modifies account, plan, subscription or billing state.
 *
 * Bounded: page size is clamped (max 50) and the underlying scans are capped in
 * lib/admin/accountsData.ts. Rows carry a masked account reference and no
 * emails, provider identifiers, webhook payloads or error text.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformOwner, forbidden } from '@/lib/adminAuth';
import { getBillingReconciliation } from '@/lib/admin/accountsData';
import { sanitizeError } from '@/lib/apiHelpers';

export async function GET(req: NextRequest) {
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) {
    return auth.email ? forbidden(auth.reason) : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  try {
    const result = await getBillingReconciliation({
      page: url.searchParams.get('page') ?? undefined,
      pageSize: url.searchParams.get('pageSize') ?? undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err, 'admin/reconciliation') }, { status: 500 });
  }
}
