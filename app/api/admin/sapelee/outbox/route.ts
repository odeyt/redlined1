/**
 * GET /api/admin/sapelee/outbox
 * Platform-owner only. Queue-depth + recent-activity view for the Sapelee
 * event outbox — read-only, never modifies queue state (that's flush.ts's
 * job, triggered separately by the scheduled workflow).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformOwner, forbidden } from '@/lib/adminAuth';
import { getAdminDb } from '@/lib/supabaseServer';
import { getOutboxMetrics, listRecentOutboxRows } from '@/lib/sapelee/metrics';

export async function GET(req: NextRequest) {
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) return forbidden(auth.reason);

  try {
    const db = getAdminDb();
    const [metrics, recentRows] = await Promise.all([
      getOutboxMetrics(db),
      listRecentOutboxRows(db, 25),
    ]);

    return NextResponse.json({ metrics, recentRows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    console.error('[admin/sapelee/outbox]', msg);
    return NextResponse.json({ error: 'Failed to load outbox status' }, { status: 500 });
  }
}
