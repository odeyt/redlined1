import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformOwner, forbidden, parseDateRange } from '@/lib/adminAuth';
import { getAcquisitionMetrics } from '@/commercial/analytics/BillingAnalyticsService';
import { getAdminDb } from '@/lib/supabaseServer';

export async function GET(req: NextRequest) {
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) return forbidden(auth.reason);

  const range = parseDateRange(req) ?? {
    to: new Date(),
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  };

  try {
    const acquisition = await getAcquisitionMetrics(range);
    return NextResponse.json({ acquisition, range: { from: range.from.toISOString(), to: range.to.toISOString() } });
  } catch (err) {
    console.error('[admin/billing-health/acquisition]', err);
    return NextResponse.json({ error: 'Failed to fetch acquisition metrics' }, { status: 500 });
  }
}

/** POST /api/admin/billing-health/acquisition — add a manual acquisition cost entry */
export async function POST(req: NextRequest) {
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) return forbidden(auth.reason);

  try {
    const body = await req.json() as Record<string, unknown>;

    const periodStart = body.period_start as string;
    const periodEnd = body.period_end as string;
    const spendAmount = Number(body.spend_amount ?? 0);
    const attributedPaidShops = Number(body.attributed_paid_shops ?? 0);

    if (!periodStart || !periodEnd || spendAmount < 0) {
      return NextResponse.json({ error: 'period_start, period_end, and spend_amount >= 0 are required' }, { status: 400 });
    }

    const db = getAdminDb();
    const { error } = await db.from('commercial_acquisition_costs').insert({
      period_start:          periodStart,
      period_end:            periodEnd,
      channel:               String(body.channel ?? 'direct'),
      campaign_name:         body.campaign_name ? String(body.campaign_name) : null,
      spend_amount:          spendAmount,
      currency:              String(body.currency ?? 'USD'),
      attributed_paid_shops: attributedPaidShops,
      notes:                 body.notes ? String(body.notes) : null,
    });

    if (error) {
      console.error('[admin/billing-health/acquisition] insert error:', error.message);
      return NextResponse.json({ error: 'Failed to save acquisition cost' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin/billing-health/acquisition] POST error:', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
