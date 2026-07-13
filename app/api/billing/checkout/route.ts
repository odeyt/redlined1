/**
 * POST /api/billing/checkout
 *
 * Creates a hosted checkout session and returns the redirect URL.
 *
 * Guards:
 *  - Billing feature flag must be enabled
 *  - Authenticated user (session required)
 *  - Owner role only (shop_users.role = 'owner')
 *  - D1 internal shops are never billed
 *  - Duplicate prevention — rejects if shop already has active/trialing subscription
 *  - Server-side product ID resolution (no client-supplied price IDs accepted)
 *
 * Body: { planId: RedlinedPlanId, billingInterval: BillingInterval }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getPaymentProvider } from '@/lib/payments/payment-service';
import { getCurrentSubscription } from '@/lib/billing/billing-service';
import { getAdminDb } from '@/lib/supabaseServer';
import { getInternalShopIds } from '@/lib/adminAuth';
import type { RedlinedPlanId, BillingInterval } from '@/lib/payments/types';

const VALID_PLANS: RedlinedPlanId[] = ['solo', 'starter', 'professional', 'business', 'enterprise'];
const VALID_INTERVALS: BillingInterval[] = ['monthly', 'annual'];

async function getAuthenticatedUser() {
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
  if (process.env.NEXT_PUBLIC_BILLING_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'Billing is not yet enabled. Contact admin@redlined1.com to activate.' },
      { status: 403 },
    );
  }

  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Owner role check — uses admin DB to bypass RLS
    const adminDb = getAdminDb();
    const { data: shopUser } = await adminDb
      .from('shop_users')
      .select('shop_id, role')
      .eq('user_id', user.id)
      .eq('role', 'owner')
      .maybeSingle();

    if (!shopUser) {
      return NextResponse.json(
        { error: 'Forbidden: only the shop owner can manage billing.' },
        { status: 403 },
      );
    }

    const { shop_id: shopId } = shopUser;

    if (getInternalShopIds().has(shopId)) {
      return NextResponse.json(
        { error: 'Internal accounts are not subject to billing.' },
        { status: 403 },
      );
    }

    const body = await req.json() as { planId?: string; billingInterval?: string };
    const { planId, billingInterval } = body;

    if (!planId || !billingInterval) {
      return NextResponse.json(
        { error: 'Missing required fields: planId, billingInterval' },
        { status: 400 },
      );
    }

    if (!VALID_PLANS.includes(planId as RedlinedPlanId)) {
      return NextResponse.json({ error: `Invalid planId: ${planId}` }, { status: 400 });
    }
    if (!VALID_INTERVALS.includes(billingInterval as BillingInterval)) {
      return NextResponse.json({ error: `Invalid billingInterval: ${billingInterval}` }, { status: 400 });
    }

    // Duplicate prevention
    const existing = await getCurrentSubscription(user.id);
    if (existing && ['active', 'trialing'].includes(existing.status)) {
      return NextResponse.json(
        {
          error: 'A subscription already exists for this account.',
          status: existing.status,
          planId: existing.plan_id,
        },
        { status: 409 },
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const provider = getPaymentProvider();

    const result = await provider.createCheckoutSession({
      userId: user.id,
      email: user.email ?? '',
      planId: planId as RedlinedPlanId,
      billingInterval: billingInterval as BillingInterval,
      successUrl: process.env.CREEM_SUCCESS_URL ?? `${siteUrl}/billing/success`,
      cancelUrl: process.env.CREEM_CANCEL_URL ?? `${siteUrl}/pricing`,
      metadata: { shop_id: shopId },
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
