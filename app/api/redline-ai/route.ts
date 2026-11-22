export const dynamic = 'force-dynamic';
// Redline AI (prototype) — read-only chat panel API.
// Spec: ~/workspace/redlined1/redline-ai-spec.md §3/§5 Phase 1 (internal only).
//
// POST { job, ... } runs one of the five jobs for the caller's OWN shop.
// GET returns whether the feature is enabled for the caller's shop.
//
// Safety shape, deliberately the same as the rest of the app:
//  - Auth: Supabase session cookie; queries run on that SSR client, so RLS
//    applies to every read.
//  - Shop: resolved server-side by lib/shops/requestShop from the caller's
//    own memberships (owner/manager only). The x-shop-id header can only
//    choose among those memberships — it can never grant one.
//  - Gate: feature flag `redline_ai` (lib/featureFlags), fail-closed —
//    no flag row, no access. Disabled by default; see
//    supabase/migrations/2026-11-22_redline_ai_flag.sql.
//  - Read-only: this route never writes business data and never sends
//    anything. Follow-ups come back as draft text for staff to copy.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { resolveRequestShop } from '@/lib/shops/requestShop';
import { isEnabled } from '@/lib/featureFlags/featureFlagService';
import { logger } from '@/lib/logger';
import {
  RedlineAiError,
  runRedlineAiJob,
  type RedlineAiRequest,
} from '@/lib/redline-ai/service';
import type { RedlineAiJob } from '@/lib/redline-ai/types';

const FLAG_KEY = 'redline_ai';
const ALLOWED_ROLES = ['owner', 'manager'] as const;
const JOBS: readonly RedlineAiJob[] = [
  'morning_brief',
  'stale_estimates',
  'who_owes',
  'vehicle_history',
  'draft_follow_up',
  'vehicle_search',
];

async function getAuthCtx(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const requested = req.headers.get('x-shop-id') ?? cookieStore.get('shopId')?.value ?? null;
  const membership = await resolveRequestShop(supabase, user.id, requested, ALLOWED_ROLES);
  if (!membership) return null;
  return {
    supabase,
    userId: user.id,
    shopId: membership.shop_id,
    role: membership.role,
  };
}

async function flagOn(ctx: { userId: string; shopId: string; role: string }): Promise<boolean> {
  const env = (process.env.VERCEL_ENV === 'production'
    ? 'production'
    : process.env.NODE_ENV === 'development' ? 'development' : 'staging') as
    'production' | 'staging' | 'development';
  return isEnabled(FLAG_KEY, {
    userId: ctx.userId,
    shopId: ctx.shopId,
    role: ctx.role,
    environment: env,
  });
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const enabled = await flagOn(ctx);
    return NextResponse.json({ enabled, jobs: enabled ? JOBS : [] });
  } catch (e) {
    logger.error('Redline AI status error', e, { module: 'api/redline-ai' });
    return NextResponse.json({ enabled: false }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!(await flagOn(ctx))) {
      return NextResponse.json({ disabled: true, error: 'Redline AI is not enabled for this shop.' });
    }

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* handled below */ }
    const job = body.job as RedlineAiJob;
    if (!JOBS.includes(job)) {
      return NextResponse.json({ error: `Unknown job: ${String(body.job)}` }, { status: 400 });
    }

    const request: RedlineAiRequest = {
      job,
      vehicleId: typeof body.vehicleId === 'string' ? body.vehicleId : undefined,
      vehicleQuery: typeof body.vehicleQuery === 'string' ? body.vehicleQuery : undefined,
      draftKind: body.draftKind === 'estimate' || body.draftKind === 'invoice'
        ? body.draftKind : undefined,
      draftId: typeof body.draftId === 'string' ? body.draftId : undefined,
    };

    const today = new Date().toISOString().split('T')[0];
    const result = await runRedlineAiJob(ctx.supabase, ctx.shopId, request, today);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof RedlineAiError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    logger.error('Redline AI job error', e, { module: 'api/redline-ai' });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 },
    );
  }
}
