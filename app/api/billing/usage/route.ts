/**
 * GET /api/billing/usage
 * Returns monthly usage for the current shop, including Free plan limits.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/supabaseServer';
import { FREE_LIMITS } from '@/lib/freeLimits';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = getAdminDb();

    const { data: profile } = await db
      .from('profiles')
      .select('plan, shop_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.shop_id) return NextResponse.json({ error: 'No shop found' }, { status: 404 });

    const { shop_id: shopId, plan } = profile;
    const yearMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

    // Monthly counters from usage_monthly table (Free plan enforcement)
    const { data: monthlyRows } = await db
      .from('usage_monthly')
      .select('metric, count')
      .eq('shop_id', shopId)
      .eq('year_month', yearMonth);

    const monthly: Record<string, number> = {};
    for (const row of (monthlyRows ?? [])) {
      monthly[row.metric] = row.count;
    }

    // Absolute capacity counts
    const [customersRes, vehiclesRes] = await Promise.all([
      db.from('customers').select('id', { count: 'exact', head: true }).eq('shop_id', shopId),
      db.from('vehicles').select('id', { count: 'exact', head: true }).eq('shop_id', shopId),
    ]);

    const resetDate = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
      .toISOString()
      .slice(0, 10);

    return NextResponse.json({
      plan,
      shopId,
      yearMonth,
      resetDate,
      limits: plan === 'free' ? FREE_LIMITS : null,
      usage: {
        customers:             customersRes.count ?? 0,
        vehicles:              vehiclesRes.count ?? 0,
        completedJobsPerMonth: monthly['completed_jobs'] ?? 0,
        aiCasesPerMonth:       monthly['ai_cases'] ?? 0,
        vinLookupsPerMonth:    monthly['vin_lookups'] ?? 0,
        appointmentsPerMonth:  monthly['appointments'] ?? 0,
        dviPerMonth:           monthly['dvi'] ?? 0,
      },
    });
  } catch (err) {
    console.error('[/api/billing/usage]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
