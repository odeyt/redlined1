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
  // Auth via cookie session
  const cookieStore = await cookies();
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only owners may seed
  const { data: memberships } = await admin
    .from('shop_users').select('role, shop_id').eq('user_id', user.id).eq('role', 'owner');
  if (!memberships?.length) return NextResponse.json({ error: 'Owner required' }, { status: 403 });

  const { vehicle, jobDescription, laborHours, laborRate } = await req.json();
  if (!jobDescription || !laborHours) return NextResponse.json({ ok: true }); // silent skip

  const shopId = memberships[0].shop_id as string;
  const hours = Number(laborHours);
  const rate = Number(laborRate ?? 145);
  const { year, make, model } = parseVehicle(vehicle ?? '');
  const slug = slugifyJob(jobDescription);

  if (!slug) return NextResponse.json({ ok: true });

  // Upsert: create baseline on first seen, increment counter on repeat
  const { data: existing } = await admin
    .from('standard_labor_guides')
    .select('id, times_performed')
    .eq('shop_id', shopId)
    .eq('make', make)
    .eq('model', model)
    .eq('job_description_slug', slug)
    .maybeSingle();

  if (existing) {
    await admin
      .from('standard_labor_guides')
      .update({ times_performed: existing.times_performed + 1, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await admin.from('standard_labor_guides').insert({
      shop_id: shopId,
      make,
      model,
      year,
      job_description_raw: jobDescription,
      job_description_slug: slug,
      suggested_hours: hours,
      flat_rate_cost: parseFloat((hours * rate).toFixed(2)),
      labor_rate: rate,
      times_performed: 1,
      source: 'historical',
    });
  }

  return NextResponse.json({ ok: true });
}
