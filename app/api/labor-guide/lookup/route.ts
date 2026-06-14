import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { slugifyJob, parseVehicle } from '@/lib/slugify';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: memberships } = await admin
    .from('shop_users').select('role, shop_id').eq('user_id', user.id).eq('role', 'owner');
  if (!memberships?.length) return NextResponse.json({ error: 'Owner required' }, { status: 403 });

  const shopId = memberships[0].shop_id as string;
  const { serviceType, vehicle } = await req.json();
  const slug = slugifyJob(serviceType ?? '');
  const { year, make } = parseVehicle(vehicle ?? '');

  // 1. Check historical guide first (shop-specific self-learned data)
  const { data: historical } = await admin
    .from('standard_labor_guides')
    .select('*')
    .eq('shop_id', shopId)
    .ilike('job_description_slug', `%${slug}%`)
    .order('times_performed', { ascending: false })
    .limit(5);

  if (historical && historical.length > 0) {
    const best = historical[0];
    return NextResponse.json({
      found: true,
      source: 'historical',
      suggestedHours: Number(best.suggested_hours),
      flatRateCost: Number(best.flat_rate_cost),
      laborRate: Number(best.labor_rate),
      timesPerformed: best.times_performed,
      jobDescription: best.job_description_raw,
      notes: `Based on ${best.times_performed} job${best.times_performed > 1 ? 's' : ''} in your shop history`,
    });
  }

  // 2. Fall back to static labor_times table
  const { data: staticRows } = await admin
    .from('labor_times')
    .select('suggested_hours, notes, source, make')
    .ilike('service_type', `%${serviceType?.replace(/\s+/g, '%')}%`)
    .lte('year_from', year ?? 2000)
    .gte('year_to', year ?? 2099)
    .limit(10);

  if (!staticRows || staticRows.length === 0) {
    return NextResponse.json({ found: false, message: `No rate found for "${serviceType}"` });
  }

  const { data: settings } = await admin
    .from('shop_settings').select('labor_rate').eq('shop_id', shopId).single();
  const laborRate = Number(settings?.labor_rate ?? 145);

  const specific = staticRows.find((r: Record<string, unknown>) =>
    r.make !== '*' && make && (r.make as string).toLowerCase() === make.toLowerCase()
  );
  const best = specific ?? staticRows[0];

  return NextResponse.json({
    found: true,
    source: 'industry',
    suggestedHours: Number(best.suggested_hours),
    flatRateCost: parseFloat((Number(best.suggested_hours) * laborRate).toFixed(2)),
    laborRate,
    timesPerformed: null,
    jobDescription: serviceType,
    notes: (best.notes as string) ?? '',
  });
}
