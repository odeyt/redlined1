import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  // ── 1. Authenticate ──────────────────────────────────────────────
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: { user }, error: authErr } = await admin.auth.getUser(auth.slice(7));
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── 2. Parse body ────────────────────────────────────────────────
  const { shopId, serviceType, vehicle } = await req.json();
  if (!shopId || !serviceType) {
    return NextResponse.json({ error: 'Missing shopId or serviceType' }, { status: 400 });
  }

  // ── 3. Verify owner role ─────────────────────────────────────────
  // This is the security gate — only owners see flat-rate data
  const { data: membership } = await admin
    .from('shop_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('shop_id', shopId)
    .single();

  if (!membership) {
    return NextResponse.json({ error: `No shop membership found for shopId: ${shopId}` }, { status: 403 });
  }
  if (membership.role !== 'owner') {
    return NextResponse.json({ error: `Access denied — role is "${membership.role}", owner required` }, { status: 403 });
  }

  // ── 4. Pull shop labor rate ──────────────────────────────────────
  const { data: settings } = await admin
    .from('shop_settings')
    .select('labor_rate')
    .eq('shop_id', shopId)
    .single();
  const laborRate: number = Number(settings?.labor_rate ?? 145);

  // ── 5. Parse vehicle string into year/make ───────────────────────
  // Supports: "2019 Honda Civic", "Honda Civic", "2019 Ford F-150 XLT"
  const parts = (vehicle ?? '').trim().split(/\s+/);
  const year = parts[0]?.match(/^\d{4}$/) ? parseInt(parts[0]) : null;
  const make = (year ? parts[1] : parts[0])?.toLowerCase() ?? '';

  // ── 6. Query labor_times ─────────────────────────────────────────
  // Try make-specific first, fall back to universal ('*')
  let query = admin
    .from('labor_times')
    .select('suggested_hours, notes, source, make')
    .ilike('service_type', `%${serviceType.replace(/\s+/g, '%')}%`)
    .lte('year_from', year ?? 2000)
    .gte('year_to', year ?? 2099)
    .limit(10);

  const { data: rows } = await query;

  if (!rows || rows.length === 0) {
    return NextResponse.json({ found: false, message: `No flat-rate data found for "${serviceType}"` });
  }

  // Prefer make-specific rows over universal ones
  const specific = rows.find(r => r.make !== '*' && make && r.make.toLowerCase() === make);
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
