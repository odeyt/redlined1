import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformOwner, forbidden, parseDateRange } from '@/lib/adminAuth';
import { getTrialMetrics } from '@/commercial/analytics/BillingAnalyticsService';

export async function GET(req: NextRequest) {
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) return forbidden(auth.reason);

  const range = parseDateRange(req) ?? {
    to: new Date(),
    from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
  };

  try {
    const trials = await getTrialMetrics(range);
    return NextResponse.json({ trials, range: { from: range.from.toISOString(), to: range.to.toISOString() } });
  } catch (err) {
    console.error('[admin/billing-health/trials]', err);
    return NextResponse.json({ error: 'Failed to fetch trial metrics' }, { status: 500 });
  }
}
