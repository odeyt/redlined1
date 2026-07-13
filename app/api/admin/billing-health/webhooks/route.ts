import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformOwner, forbidden, parseDateRange } from '@/lib/adminAuth';
import { getWebhookHealth } from '@/commercial/analytics/BillingAnalyticsService';

export async function GET(req: NextRequest) {
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) return forbidden(auth.reason);

  const range = parseDateRange(req) ?? {
    to: new Date(),
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  };

  try {
    const webhook = await getWebhookHealth(range);
    // Never expose: signatures, secrets, full payloads
    return NextResponse.json({
      webhook,
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
    });
  } catch (err) {
    console.error('[admin/billing-health/webhooks]', err);
    return NextResponse.json({ error: 'Failed to fetch webhook health' }, { status: 500 });
  }
}
