export const dynamic = 'force-dynamic'
// SI-9: Business Memory API
// GET  — shop memory summary, or entity memory with ?entity_type=&entity_id=
// POST — refresh memory (shop-level or entity-level)

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { featureTablesReady } from '@/lib/intelligence/tableAvailability';

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
    const { data } = await getAdminDb().from('feature_flags')
      .select('enabled').eq('flag_key', flagKey).maybeSingle();
    return (data as { enabled?: boolean } | null)?.enabled === true;
  } catch { return false; }
}

// GET — shop summary or entity memory
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const enabled = await isFlagEnabled('business_memory_engine');
    if (!enabled) return NextResponse.json({ disabled: true, data: null });

    // business_memory and parts_order_items do not exist yet, and
    // BusinessMemoryEngine catches its own errors — so without this the panel
    // renders an empty summary indistinguishable from "nothing to report".
    //
    // The catch below already tried to detect this by matching 'does not
    // exist' and 'relation' in the error text, but PostgREST answers a missing
    // table with "Could not find the table 'public.x' in the schema cache", so
    // it never fired. Probing up front does not depend on error wording.
    if (!(await featureTablesReady('business_memory', 'parts_order_items'))) {
      return NextResponse.json({
        unavailable: true,
        reason: 'Business memory is not set up for this deployment yet.',
        data: null,
      });
    }

    const url = new URL(req.url);
    const entityType = url.searchParams.get('entity_type');
    const entityId   = url.searchParams.get('entity_id');

    if (entityType && entityId) {
      const { getMemoryForEntity } = await import('@/intelligence/memory/BusinessMemoryEngine');
      const items = await getMemoryForEntity(ctx.shopId, entityType as import('@/intelligence/memory/types').MemoryEntityType, entityId);
      return NextResponse.json({ data: items });
    }

    const { getMemorySummary } = await import('@/intelligence/memory/BusinessMemoryEngine');
    const summary = await getMemorySummary(ctx.shopId);
    return NextResponse.json({ data: summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    if (msg.includes('does not exist') || msg.includes('relation')) {
      return NextResponse.json({ disabled: true, data: null, migrationRequired: true });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — trigger memory refresh
export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const enabled = await isFlagEnabled('business_memory_engine');
    if (!enabled) return NextResponse.json({ disabled: true });

    let body: { entityType?: string; entityId?: string; dryRun?: boolean } = {};
    try { body = await req.json() as typeof body; } catch { /* no body */ }

    const { extractMemoryForShop, extractCustomerMemory, extractVehicleMemory } =
      await import('@/intelligence/memory/BusinessMemoryEngine');

    let result;
    if (body.entityType === 'customer' && body.entityId) {
      result = await extractCustomerMemory(ctx.shopId, body.entityId, body.dryRun ?? false);
    } else if (body.entityType === 'vehicle' && body.entityId) {
      result = await extractVehicleMemory(ctx.shopId, body.entityId, body.dryRun ?? false);
    } else {
      result = await extractMemoryForShop(ctx.shopId, body.dryRun ?? false);
    }

    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    if (msg.includes('does not exist') || msg.includes('relation')) {
      return NextResponse.json({ disabled: true, migrationRequired: true });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
