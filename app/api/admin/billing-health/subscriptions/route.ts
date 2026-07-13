import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformOwner, forbidden } from '@/lib/adminAuth';
import { getSubscriptionSummary } from '@/commercial/analytics/BillingAnalyticsService';

export async function GET(req: NextRequest) {
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) return forbidden(auth.reason);

  try {
    const summary = await getSubscriptionSummary();
    return NextResponse.json({ subscriptions: summary });
  } catch (err) {
    console.error('[admin/billing-health/subscriptions]', err);
    return NextResponse.json({ error: 'Failed to fetch subscription summary' }, { status: 500 });
  }
}
