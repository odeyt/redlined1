export const dynamic = 'force-dynamic';
// GET /api/ai/usage — the AI usage meter: this month's spend against the cap.
// Owner/manager of an internal D1 shop with `ai_translation` on. Read-only.

import { NextRequest, NextResponse } from 'next/server';
import { aiGate } from '@/lib/ai/requestGate';
import { getTextProvider } from '@/lib/ai/text/providerFactory';
import { budgetState, monthlyBudgetUsd, monthStartUtc, readMonthUsage } from '@/lib/ai/budget';

export async function GET(req: NextRequest) {
  const gate = await aiGate(req, ['owner', 'manager']);
  if (!gate.ok) return NextResponse.json({ enabled: false, reason: gate.reason }, { status: gate.status === 200 ? 200 : gate.status });

  const provider = getTextProvider();
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const usage = await readMonthUsage(getAdminDb());
    return NextResponse.json({
      enabled: true,
      monthStart: monthStartUtc(),
      requests: usage.requests,
      ...budgetState(usage.spentUsd, monthlyBudgetUsd()),
      provider: provider?.id ?? null,
      model: provider?.model ?? null,
    });
  } catch (e) {
    return NextResponse.json({
      enabled: true,
      error: e instanceof Error ? e.message : 'Usage unavailable',
      provider: provider?.id ?? null,
      model: provider?.model ?? null,
    });
  }
}
