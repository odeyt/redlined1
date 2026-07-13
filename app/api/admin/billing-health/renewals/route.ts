import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformOwner, forbidden, parseDateRange } from '@/lib/adminAuth';
import { getRenewalHealth } from '@/commercial/analytics/BillingAnalyticsService';

export async function GET(req: NextRequest) {
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) return forbidden(auth.reason);

  const range = parseDateRange(req) ?? {
    to: new Date(),
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  };

  try {
    const renewals = await getRenewalHealth(range);
    return NextResponse.json({ renewals, range: { from: range.from.toISOString(), to: range.to.toISOString() } });
  } catch (err) {
    console.error('[admin/billing-health/renewals]', err);
    return NextResponse.json({ error: 'Failed to fetch renewal health' }, { status: 500 });
  }
}
