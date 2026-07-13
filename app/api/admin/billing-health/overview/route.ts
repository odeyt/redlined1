/**
 * GET /api/admin/billing-health/overview
 * Platform-owner only. Returns the full billing health overview.
 * Read-only. Never modifies billing state.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformOwner, forbidden, parseDateRange } from '@/lib/adminAuth';
import { getBillingOverview } from '@/commercial/analytics/BillingAnalyticsService';
import { runDataQualityChecks } from '@/commercial/analytics/BillingDataQualityService';

export async function GET(req: NextRequest) {
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) return forbidden(auth.reason);

  const range = parseDateRange(req) ?? {
    to: new Date(),
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  };

  try {
    const [overview, dataQuality] = await Promise.all([
      getBillingOverview(range),
      runDataQualityChecks(),
    ]);

    return NextResponse.json({ overview, dataQuality });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    console.error('[admin/billing-health/overview]', msg);
    return NextResponse.json({ error: 'Failed to compute billing overview' }, { status: 500 });
  }
}
