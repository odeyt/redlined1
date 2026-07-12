/**
 * POST /api/billing/portal
 *
 * Creates a Creem billing portal session and returns the redirect URL.
 *
 * Guards:
 *  - Authenticated user (session required)
 *  - Owner role only
 *  - Must have an existing subscription with a provider_customer_id
 *
 * Body: { returnUrl?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getPaymentProvider } from '@/lib/payments/payment-service';
import { getCurrentSubscription } from '@/lib/billing/billing-service';

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
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Owner role check ──────────────────────────────────────────────────────
    const { createClient } = await import('@supabase/supabase-js');
    const adminDb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: shopUser } = await adminDb
      .from('shop_users')
      .select('shop_id, role')
      .eq('user_id', user.id)
      .eq('role', 'owner')
      .maybeSingle();

    if (!shopUser) {
      return NextResponse.json(
        { error: 'Forbidden: only the shop owner can access billing settings.' },
        { status: 403 },
      );
    }

    // ── Subscription lookup ───────────────────────────────────────────────────
    const sub = await getCurrentSubscription(user.id);
    if (!sub?.provider_customer_id) {
      return NextResponse.json(
        { error: 'No active subscription found. Please subscribe first.' },
        { status: 404 },
      );
    }

    // ── Create portal session ─────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const returnUrl = (body.returnUrl as string) ?? `${siteUrl}/settings/billing`;

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
