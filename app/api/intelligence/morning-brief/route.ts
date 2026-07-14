export const dynamic = 'force-dynamic'
// SI-7: Morning Brief API
// GET  — return today's brief (or null if not yet generated)
// POST — generate/re-generate today's brief
// PATCH — dismiss / archive / mark delivered

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function getAuthCtx(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const shopId = req.headers.get('x-shop-id') ?? cookieStore.get('shopId')?.value ?? '';
  const { data: suRow } = await supabase.from('shop_users').select('role')
    .eq('user_id', user.id).eq('shop_id', shopId).maybeSingle();
  const role = (suRow as { role?: string } | null)?.role ?? '';
  return { userId: user.id, shopId, role };
}

async function isFlagEnabled(flagKey: string): Promise<boolean> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const { data, error } = await getAdminDb().from('feature_flags')
      .select('enabled').eq('flag_key', flagKey).maybeSingle();
    if (error) return true;
    return (data as { enabled?: boolean } | null)?.enabled === true;
  } catch { return true; }
}

// GET — return today's brief
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const enabled = await isFlagEnabled('morning_brief_engine');
    if (!enabled) return NextResponse.json({ disabled: true, brief: null });

    const url  = new URL(req.url);
    const date = url.searchParams.get('date') ?? undefined;

    const { getTodayBrief, getBriefByDate } = await import('@/intelligence/morning-brief/MorningBriefEngine');
    const brief = date
      ? await getBriefByDate(ctx.shopId, date)
      : await getTodayBrief(ctx.shopId);

    return NextResponse.json({ brief: brief ?? null });
  } catch (e) {
    // Safe error if migration not yet run
    const msg = e instanceof Error ? e.message : 'Internal error';
    if (msg.includes('does not exist') || msg.includes('relation')) {
      return NextResponse.json({ disabled: true, brief: null, migrationRequired: true });
    }
    return NextResponse.json({ error: msg, brief: null }, { status: 500 });
  }
}

// POST — generate/re-generate brief
export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const enabled = await isFlagEnabled('morning_brief_engine');
    if (!enabled) return NextResponse.json({ disabled: true, brief: null });

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    const date = typeof body.date === 'string' ? body.date : undefined;

    const { generateMorningBrief } = await import('@/intelligence/morning-brief/MorningBriefEngine');
    const result = await generateMorningBrief(ctx.shopId, date);

    // Fire-and-forget: log dashboard delivery
    const { createDeliveryLog } = await import('@/intelligence/morning-brief/BriefDeliveryService');
    if (result.brief.id !== 'error') {
      void createDeliveryLog(ctx.shopId, result.brief.id, 'dashboard', ctx.userId);
    }

    return NextResponse.json({
      brief:      result.brief,
      isNew:      result.isNew,
      durationMs: result.durationMs,
      warnings:   result.warnings,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    if (msg.includes('does not exist') || msg.includes('relation')) {
      return NextResponse.json({ disabled: true, brief: null, migrationRequired: true });
    }
    return NextResponse.json({ error: msg, brief: null }, { status: 500 });
  }
}

// PATCH — dismiss / archive / mark delivered
export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch {}

    const { id, action } = body as { id?: string; action?: string };
    if (!id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400 });

    const { dismissBrief, markBriefDelivered, archiveOldBriefs } =
      await import('@/intelligence/morning-brief/MorningBriefEngine');

    switch (action) {
      case 'dismiss':
        await dismissBrief(id);
        break;
      case 'archive':
        await archiveOldBriefs(ctx.shopId);
        break;
      case 'delivered':
        await markBriefDelivered(id, 'dashboard');
        break;
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal error' }, { status: 500 });
  }
}
