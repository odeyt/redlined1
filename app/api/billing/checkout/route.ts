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
import { selectBillingShop, type MembershipRow } from '@/lib/billing/checkoutEligibility';
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
  if (!user) return { user: null, memberships: [] as MembershipRow[] };

  // EVERY membership row, not `.maybeSingle()`.
  //
  // `.maybeSingle()` resolves to { data: null, error: PGRST116 } when a user
  // has more than one shop_users row, and this code read only `data`. A buyer
  // who belongs to two shops therefore looked shop-less, which silently opened
  // the two gates below that depend on knowing their shop: the role refusal,
  // and the internal-shop exemption. Both failed open for precisely the users
  // most likely to be staff — including anyone in both mirrored D1 shops.
  //
  // Ordered, so that repeated requests from the same buyer select the same
  // shop rather than whichever row the database happened to return first.
  const { data: memberships, error } = await supabase
    .from('shop_users')
    .select('role, shop_id')
    .eq('user_id', user.id)
    .order('shop_id', { ascending: true });

  // Fail closed. Swallowing this would look identical to "has no shop", and
  // that path provisions a brand-new shop and bills it.
  if (error) throw new Error(`membership lookup failed: ${error.message}`);

  return { user, memberships: (memberships ?? []) as MembershipRow[] };
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
    const { user, memberships } = await getAuthContext();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Judge the role in the shop this checkout will actually bill, and refuse
    // before a Creem session exists. The webhook applies the same allowlist
    // after payment, so anything allowed past here must be allowed there too:
    // a buyer refused only at the webhook has already been charged, and their
    // event is held as `buyer_not_eligible` with nothing activated.
    const selection = selectBillingShop(memberships);
    if (selection.kind === 'not_eligible') {
      // Phrased to read correctly whether the buyer holds one role or several,
      // and when the row carries a role this code does not recognise.
      const held = selection.roles.length ? selection.roles.join(', ') : 'no recognised role';
      return NextResponse.json(
        {
          error: 'Only a shop owner or manager can start a subscription.',
          detail: `Billing is limited to the owner and manager roles; this account holds: ${held}. Ask an owner or manager of the shop to buy the plan.`,
          roles: selection.roles,
        },
        { status: 403 },
      );
    }
    const selectedShopId = selection.kind === 'shop' ? selection.shopId : '';

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

    if (selectedShopId && getInternalShopIds().has(selectedShopId)) {
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
    let shopId = selectedShopId;
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
