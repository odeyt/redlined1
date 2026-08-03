/**
 * POST /api/billing/checkout
 *
 * Creates a hosted checkout session and returns the URL.
 * Calls the active payment provider — no provider-specific logic here.
 *
 * Body: { planId: RedlinedPlanId, billingInterval: BillingInterval }
 */

import { getOrCreatePrimaryShop } from '@/commercial/onboarding/ShopProvisioningService';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getPaymentProvider } from '@/lib/payments/payment-service';
import { getInternalShopIds } from '@/lib/adminAuth';
import type { RedlinedPlanId, BillingInterval } from '@/lib/payments/types';
import { PLANS, PLAN_ORDER } from '@/config/plans';

async function getAuthContext() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, shopUser: null };

  const { data: shopUser } = await supabase
    .from('shop_users')
    .select('role, shop_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return { user, shopUser };
}

export async function POST(req: NextRequest) {
  // Use runtime CREEM_API_KEY presence as the billing gate on the server.
  // NEXT_PUBLIC_BILLING_ENABLED is baked at build time and unreliable for API routes.
  const billingEnabled =
    process.env.NEXT_PUBLIC_BILLING_ENABLED?.trim() === 'true' ||
    !!process.env.CREEM_API_KEY?.trim();
  if (!billingEnabled) {
    return NextResponse.json({ error: 'Billing is not enabled on this deployment' }, { status: 403 });
  }

  try {
    const { user, shopUser } = await getAuthContext();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (shopUser?.role === 'technician') {
      return NextResponse.json({ error: 'Technicians cannot manage billing' }, { status: 403 });
    }

    // Block internal staff from being billed.
    // PLATFORM_OWNER_EMAIL / NEXT_PUBLIC_PLATFORM_OWNER_EMAIL — comma-separated exact emails
    // BILLING_EXEMPT_DOMAINS — comma-separated domains, e.g. "d1autozone.com"
    const userEmail = (user.email ?? '').toLowerCase();
    const userDomain = userEmail.split('@')[1] ?? '';

    const exemptEmails = new Set(
      [process.env.PLATFORM_OWNER_EMAIL, process.env.NEXT_PUBLIC_PLATFORM_OWNER_EMAIL]
        .flatMap(v => (v ?? '').split(','))
        .map(e => e.trim().toLowerCase())
        .filter(Boolean)
    );
    const exemptDomains = new Set(
      (process.env.BILLING_EXEMPT_DOMAINS ?? '')
        .split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
    );

    if (exemptEmails.has(userEmail) || (userDomain && exemptDomains.has(userDomain))) {
      return NextResponse.json({ error: 'This account is not subject to billing' }, { status: 403 });
    }

    if (shopUser?.shop_id && getInternalShopIds().has(shopUser.shop_id)) {
      return NextResponse.json({ error: 'Internal accounts are not subject to billing' }, { status: 403 });
    }

    const body = await req.json() as { planId?: string; billingInterval?: string };
    const { planId, billingInterval } = body;

    if (!planId || !billingInterval) {
      return NextResponse.json(
        { error: 'Missing required fields: planId, billingInterval' },
        { status: 400 },
      );
    }

    // Derived from the plan catalogue rather than restated here, so adding a
    // plan cannot leave this list stale.
    const validPlans = PLAN_ORDER;
    const validIntervals: BillingInterval[] = ['monthly', 'annual'];

    if (!validPlans.includes(planId as RedlinedPlanId)) {
      return NextResponse.json({ error: `Invalid planId: ${planId}` }, { status: 400 });
    }

    // A plan with no price is sold by conversation, not self-service —
    // Enterprise has no Creem product because the amount is negotiated. It was
    // nonetheless accepted here, so the request reached getProductId() and threw
    // "Missing environment variable: CREEM_ENTERPRISE_MONTHLY_PRODUCT_ID",
    // surfacing to the customer as a 500 naming a variable only we can set.
    //
    // Refuse it up front, and say the thing the customer can act on.
    const plan = PLANS[planId as RedlinedPlanId];
    if (plan.monthlyPrice === null || plan.annualPrice === null) {
      return NextResponse.json(
        {
          error: `The ${plan.name} plan is priced individually and cannot be bought online.`,
          detail: 'Please contact sales to arrange it.',
          contactUrl: '/contact-sales',
        },
        { status: 400 },
      );
    }
    if (!validIntervals.includes(billingInterval as BillingInterval)) {
      return NextResponse.json({ error: `Invalid billingInterval: ${billingInterval}` }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const provider = getPaymentProvider();

    // Shops are provisioned in the auth callback, so any route into the app
    // that bypasses that callback leaves a user with no shop at all. They can
    // still use the app — the sidebar falls back to its "My Shop" defaults —
    // but there is nothing for a subscription to attach to.
    //
    // A sandbox purchase hit exactly that: the payment succeeded, the webhook
    // verified, and activation was skipped because neither the checkout
    // metadata nor the shop_users fallback could name a shop. The customer is
    // charged and nothing happens.
    //
    // Provisioning here closes that: it is idempotent, and this is the last
    // point before money moves at which a shop can still be created.
    let shopId = shopUser?.shop_id ?? '';
    if (!shopId) {
      const meta = user.user_metadata as { full_name?: string; shop_name?: string } | null;
      const { shopId: provisioned } = await getOrCreatePrimaryShop(user.id, {
        ownerName: meta?.full_name,
        shopName:  meta?.shop_name || 'My Shop',
      });
      shopId = provisioned;
      console.warn('[billing/checkout] buyer had no shop; provisioned one before checkout.');
    }

    const result = await provider.createCheckoutSession({
      userId: user.id,
      email: user.email ?? '',
      planId: planId as RedlinedPlanId,
      billingInterval: billingInterval as BillingInterval,
      // The webhook keys the whole activation off metadata: it looks for
      // `shop_id` to find the subscription row and `plan_key` to know what was
      // bought. Neither was being sent, so a completed payment wrote nothing —
      // the handler's `if (shopId && ...)` guard skipped every branch and the
      // event was recorded as received but unprocessed.
      metadata: {
        shop_id:  shopId,
        plan_key: planId,
      },
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
