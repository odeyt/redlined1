/**
 * POST /api/billing/portal
 *
 * Creates a billing portal session and returns the URL.
 * Requires the user to have an existing subscription (provider_customer_id).
 *
 * Body: { returnUrl?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getPaymentProvider } from '@/lib/payments/payment-service';
import { getCurrentSubscription } from '@/lib/billing/billing-service';

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
  if (process.env.NEXT_PUBLIC_BILLING_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Billing is not enabled on this deployment' }, { status: 403 });
  }

  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sub = await getCurrentSubscription(user.id);
    if (!sub?.provider_customer_id) {
      return NextResponse.json(
        { error: 'No active subscription found. Please subscribe first.' },
        { status: 404 },
      );
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const returnUrl = (body.returnUrl as string) ?? `${siteUrl}/app`;

    const provider = getPaymentProvider();
    const result = await provider.createCustomerPortalSession({
      userId: user.id,
      providerCustomerId: sub.provider_customer_id,
      returnUrl,
    });

    return NextResponse.json({ url: result.portalUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[billing/portal]', message);
    return NextResponse.json(
      { error: 'Failed to create portal session', detail: message },
      { status: 500 },
    );
  }
}
