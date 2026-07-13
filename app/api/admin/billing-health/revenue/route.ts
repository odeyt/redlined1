import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformOwner, forbidden } from '@/lib/adminAuth';
import { getRevenueMetrics } from '@/commercial/analytics/BillingAnalyticsService';

export async function GET(req: NextRequest) {
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) return forbidden(auth.reason);

  try {
    const revenue = await getRevenueMetrics();
    return NextResponse.json({ revenue });
  } catch (err) {
    console.error('[admin/billing-health/revenue]', err);
    return NextResponse.json({ error: 'Failed to fetch revenue metrics' }, { status: 500 });
  }
}
