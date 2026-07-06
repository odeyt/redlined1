/**
 * POST /api/billing/checkout
 *
 * Creates a hosted checkout session and returns the URL.
 * Calls the active payment provider — no provider-specific logic here.
 *
 * Body: { planId: RedlinedPlanId, billingInterval: BillingInterval }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getPaymentProvider } from '@/lib/payments/payment-service';
import type { RedlinedPlanId, BillingInterval } from '@/lib/payments/types';

async function getUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as { planId?: string; billingInterval?: string };
    const { planId, billingInterval } = body;

    if (!planId || !billingInterval) {
      return NextResponse.json(
        { error: 'Missing required fields: planId, billingInterval' },
        { status: 400 },
      );
    }

    const validPlans: RedlinedPlanId[] = ['starter', 'professional', 'shop_pro', 'enterprise'];
    const validIntervals: BillingInterval[] = ['monthly', 'annual'];

    if (!validPlans.includes(planId as RedlinedPlanId)) {
      return NextResponse.json({ error: `Invalid planId: ${planId}` }, { status: 400 });
    }
    if (!validIntervals.includes(billingInterval as BillingInterval)) {
      return NextResponse.json({ error: `Invalid billingInterval: ${billingInterval}` }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const provider = getPaymentProvider();

    const result = await provider.createCheckoutSession({
      userId: user.id,
      email: user.email ?? '',
      planId: planId as RedlinedPlanId,
      billingInterval: billingInterval as BillingInterval,
      successUrl: `${process.env.CREEM_SUCCESS_URL ?? `${siteUrl}/app?billing=success`}`,
      cancelUrl: `${process.env.CREEM_CANCEL_URL ?? `${siteUrl}/app?billing=canceled`}`,
    });

    return NextResponse.json({ url: result.checkoutUrl, sessionId: result.sessionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[billing/checkout]', message);
    return NextResponse.json(
      { error: 'Failed to create checkout session', detail: message },
      { status: 500 },
    );
  }
}
