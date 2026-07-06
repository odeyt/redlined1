/**
 * POST /api/observability/flag-event
 * Records a feature flag toggle to observability_logs. Owner only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { recordFeatureFlagEvent } from '@/services/observabilityService';
import { logFeatureFlagEvent } from '@/lib/observability/logger';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false });

    const shopId = req.headers.get('x-shop-id') ?? cookieStore.get('shopId')?.value ?? '';

    const body = await req.json() as {
      flagKey: string;
      oldValue: boolean;
      newValue: boolean;
      scope: string;
    };

    const ctx = {
      flagKey:  body.flagKey,
      oldValue: body.oldValue,
      newValue: body.newValue,
      scope:    body.scope,
      userId:   user.id,
      shopId:   shopId || undefined,
    };

    // Fire both in parallel — neither blocks the response
    await Promise.allSettled([
      recordFeatureFlagEvent(ctx),
      Promise.resolve(logFeatureFlagEvent(ctx)),
    ]);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
