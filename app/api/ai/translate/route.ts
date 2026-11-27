export const dynamic = 'force-dynamic';
// POST /api/ai/translate — AI pilot: translate one estimate/invoice line
// description between English and Lao.
//
// Owner-approved 2026-11-27: Grok via the provider layer, D1's own shops only,
// part/service text only, $20/month cap. Behind `ai_translation` (default OFF).
//
// Never fails the screen: every "no" (flag off, not an internal shop, no
// provider, over budget, provider error) answers 200 with `text: null` and a
// reason, and the browser falls back to the translation it used before.

import { NextRequest, NextResponse } from 'next/server';
import { aiGate } from '@/lib/ai/requestGate';
import { getTextProvider } from '@/lib/ai/text/providerFactory';
import {
  prepareForTranslation, translationSystemPrompt, cleanTranslation,
  MAX_TRANSLATE_OUTPUT_TOKENS, type Lang,
} from '@/lib/ai/translation';
import { budgetState, monthlyBudgetUsd, readMonthUsage, recordAiUsage, costToRecord } from '@/lib/ai/budget';

function skip(reason: string, status = 200) {
  return NextResponse.json({ text: null, source: 'none', reason }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const gate = await aiGate(req);
    if (!gate.ok) return skip(gate.reason, gate.status);

    const body = await req.json().catch(() => ({})) as { text?: unknown; to?: unknown };
    const to: Lang | null = body.to === 'lo' || body.to === 'en' ? body.to : null;
    if (!to) return skip('bad_target', 400);

    const prepared = prepareForTranslation(body.text);
    if (!prepared.ok) return skip(prepared.reason);

    const provider = getTextProvider();
    if (!provider) return skip('no_provider');

    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();

    // Fail closed: no readable spend, no AI call.
    let spent: number;
    try { spent = (await readMonthUsage(db)).spentUsd; }
    catch (e) {
      console.error('[ai:translate] budget read failed', e instanceof Error ? e.message : e);
      return skip('budget_unavailable');
    }
    if (!budgetState(spent, monthlyBudgetUsd()).allowed) return skip('over_budget');

    const result = await provider.complete({
      system: translationSystemPrompt(to),
      user: prepared.text,
      maxOutputTokens: MAX_TRANSLATE_OUTPUT_TOKENS,
    });
    if (!result) return skip('provider_failed');

    // Recorded before replying so the next call's budget check sees it.
    await recordAiUsage(db, {
      shop_id: gate.shopId,
      user_id: gate.userId,
      feature: 'translate_line',
      provider: result.provider,
      model: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cost_usd: costToRecord(result.reportedCostUsd, result.inputTokens, result.outputTokens, provider.pricePerMTok),
      cost_reported: result.reportedCostUsd != null,
    });

    const text = cleanTranslation(result.text);
    if (!text) return skip('empty_reply');
    return NextResponse.json({ text, source: 'ai', provider: result.provider, model: result.model });
  } catch (e) {
    console.error('[ai:translate]', e instanceof Error ? e.message : e);
    return skip('error');
  }
}
