import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  // ── 1. Authenticate via cookie session (same as browser) ─────────
  const cookieStore = await cookies();
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
      },
    }
  );

  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // ── 2. Parse body ────────────────────────────────────────────────
  const { serviceType, vehicle } = await req.json();
  if (!serviceType) {
    return NextResponse.json({ error: 'Missing serviceType' }, { status: 400 });
  }

  // ── 3. Verify owner role (service key bypasses RLS) ──────────────
  const { data: memberships } = await admin
    .from('shop_users')
    .select('role, shop_id')
    .eq('user_id', user.id)
    .eq('role', 'owner');

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
  }

  // Use first owned shop for labor rate
  const shopId = memberships[0].shop_id as string;

  // ── 4. Pull shop labor rate ──────────────────────────────────────
  const { data: settings } = await admin
    .from('shop_settings')
    .select('labor_rate')
    .eq('shop_id', shopId)
    .single();
  const laborRate: number = Number(settings?.labor_rate ?? 145);

  // ── 5. Parse vehicle string ──────────────────────────────────────
  const parts = (vehicle ?? '').trim().split(/\s+/);
  const year = parts[0]?.match(/^\d{4}$/) ? parseInt(parts[0]) : null;
  const make = (year ? parts[1] : parts[0])?.toLowerCase() ?? '';

  // ── 6. Query labor_times ─────────────────────────────────────────
  const { data: rows } = await admin
    .from('labor_times')
    .select('suggested_hours, notes, source, make')
    .ilike('service_type', `%${serviceType.replace(/\s+/g, '%')}%`)
    .lte('year_from', year ?? 2000)
    .gte('year_to', year ?? 2099)
    .limit(10);

  if (!rows || rows.length === 0) {
    return NextResponse.json({ found: false, message: `No flat-rate data found for "${serviceType}"` });
  }

  const specific = rows.find((r: Record<string, unknown>) =>
    r.make !== '*' && make && (r.make as string).toLowerCase() === make
  );
  const best = specific ?? rows[0];

  return NextResponse.json({
    found: true,
    suggestedHours: Number(best.suggested_hours),
    flatRateCost: parseFloat((Number(best.suggested_hours) * laborRate).toFixed(2)),
    laborRate,
    source: best.source ?? 'internal',
    notes: best.notes ?? '',
  });
}
