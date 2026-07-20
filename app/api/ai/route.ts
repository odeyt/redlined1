import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { aiRequestSchema } from '@/lib/validation/schemas';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { logger } from '@/lib/logger';
import { reserveUsage, completeReservation, releaseReservation } from '@/lib/entitlements';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const AI_MODEL = process.env.AI_MODEL ?? 'claude-haiku-4-5-20251001';
const AI_PROVIDER = process.env.AI_PROVIDER ?? 'anthropic';

// ─── Supabase admin client (server-only) ─────────────────────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function getAuthUser(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const supabase = getAdminClient();
  const { data: { user } } = await supabase.auth.getUser(token);
  return user;
}

// ─── Usage logging ───────────────────────────────────────────────────────────

/**
 * Confirms the authenticated caller is actually a member of shopId before
 * any usage/cost gets attributed to it. Previously `shopId` was taken
 * straight from the request body/context with no check at all, so a valid
 * user from any shop could misattribute AI usage costs to a shop they don't
 * belong to. This route doesn't otherwise use shopId to scope data reads
 * (the AI call itself only uses caller-supplied `context`), so billing
 * misattribution was the actual exposure here, not a data leak.
 */
async function isShopMember(shopId: string, userId: string): Promise<boolean> {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from('shop_users')
    .select('user_id')
    .eq('shop_id', shopId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

async function logUsage(params: {
  shopId: string;
  userId: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}) {
  try {
    if (!(await isShopMember(params.shopId, params.userId))) {
      logger.warn('Skipped AI usage log — caller is not a member of the claimed shopId', { module: 'api/ai', shopId: params.shopId, userId: params.userId });
      return;
    }
    const supabase = getAdminClient();
    await supabase.from('ai_usage_logs').insert({
      shop_id: params.shopId,
      user_id: params.userId,
      feature: params.feature,
      model: params.model,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      estimated_cost: params.estimatedCost,
    });
  } catch (err) {
    logger.warn('Failed to log AI usage', { module: 'api/ai', error: String(err) });
  }
}

// ─── Mock response when no API key ───────────────────────────────────────────

function mockResponse(type: string, context: Record<string, unknown>) {
  const mocks: Record<string, unknown> = {
    dtc_explanation: {
      customerExplanation: `[MOCK] Your vehicle has triggered a diagnostic code. Our technicians will inspect it and advise on required repairs.`,
      technicianNotes: `[MOCK] Inspect related sensors and circuits. Clear code and test drive to verify.`,
      urgency: 'soon',
      commonFixes: ['[MOCK] Sensor replacement', '[MOCK] Wiring inspection', '[MOCK] Module update'],
      disclaimer: 'MOCK MODE — No API key configured. Verify with qualified technician before performing any repair.',
    },
    estimate_draft: {
      lines: [
        { description: '[MOCK] Diagnostic inspection', estimatedHours: 1.0, notes: 'Mock line — configure AI API key' },
        { description: '[MOCK] Labor', estimatedHours: 2.0, notes: '' },
      ],
      customerNote: '[MOCK] We have reviewed your vehicle inspection findings.',
      technicianNote: '[MOCK] See inspection report for details.',
      disclaimer: 'MOCK MODE — No API key configured. Verify with qualified technician.',
    },
    customer_message: {
      smsMessage: `[MOCK] Hi ${context.customerName ?? 'Customer'}, your vehicle is ${context.status ?? 'being serviced'}. We will update you shortly.`,
      emailSubject: `[MOCK] Vehicle Update — ${context.vehicle ?? 'Your Vehicle'}`,
      emailBody: `[MOCK] Dear ${context.customerName ?? 'Customer'},\n\nYour vehicle (${context.vehicle ?? 'on file'}) is currently ${context.status ?? 'being serviced'}.\n\nThank you for choosing ${context.shopName ?? 'D1 Imports'}.`,
      tone: 'professional',
    },
    invoice_summary: {
      invoiceNarrative: '[MOCK] The requested services were performed on your vehicle according to manufacturer specifications.',
      warrantyNote: '[MOCK] Parts and labor are covered under our standard 90-day warranty.',
      followUpRecommendations: ['[MOCK] Schedule next oil change in 5,000 miles'],
      disclaimer: 'MOCK MODE — No API key configured.',
    },
    repair_case_summary: {
      title: '[MOCK] Repair Case Summary',
      summary: '[MOCK] Vehicle presented with reported symptoms. Diagnostic testing performed and root cause identified.',
      keyFindings: ['[MOCK] Diagnostic code confirmed', '[MOCK] Component tested and found faulty'],
      confirmedFix: '[MOCK] Component replaced and system verified',
      preventionNote: '[MOCK] Regular maintenance recommended',
      confidenceScore: 0.5,
    },
  };
  return mocks[type] ?? { error: 'Unknown task type', mock: true };
}

// ─── Anthropic API call ───────────────────────────────────────────────────────

async function callAnthropic(system: string, userMessage: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content = data.content?.[0]?.text ?? '';

  // Parse JSON from the response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI response did not contain valid JSON');

  return {
    result: JSON.parse(jsonMatch[0]),
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse + validate body
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = aiRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.issues },
        { status: 422 }
      );
    }

    const { type, context, shopId } = parsed.data;
    const resolvedShopId = shopId ?? context.shopId as string ?? '';

    // Atomically reserve usage before beginning the AI call.
    // Two simultaneous requests at the limit cannot both succeed.
    // If reservation returns null, entitlement state is unknown — fail closed.
    const requestId = `ai-${resolvedShopId}-${Date.now()}`;
    let reservationId = '';
    if (resolvedShopId) {
      const reservation = await reserveUsage(resolvedShopId, 'ai_cases', 1, requestId);
      if (!reservation) {
        return NextResponse.json(
          { error: 'Service temporarily unavailable. Please try again.', retryable: true },
          { status: 503 },
        );
      }
      if (!reservation.allowed) {
        return NextResponse.json(
          { error: 'AI limit reached', upgradeRequired: true },
          { status: 402 },
        );
      }
      reservationId = reservation.idempotent ? '' : reservation.reservationId;
    }

    // Get prompt template
    const prompt = PROMPT_REGISTRY[type as keyof typeof PROMPT_REGISTRY];
    if (!prompt) {
      if (reservationId) await releaseReservation(reservationId);
      return NextResponse.json({ error: `Unknown task type: ${type}` }, { status: 400 });
    }

    // Mock mode if no API key or mock provider
    if (!ANTHROPIC_API_KEY || AI_PROVIDER === 'mock') {
      logger.info('AI running in mock mode', { module: 'api/ai', type });
      if (reservationId) await completeReservation(reservationId);
      return NextResponse.json({
        result: mockResponse(type, context),
        mock: true,
        model: 'mock',
      });
    }

    // Call AI — usage is already reserved; complete on success, release on failure
    let result: unknown;
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const aiResult = await callAnthropic(prompt.system, prompt.buildUserMessage(context));
      result = aiResult.result;
      inputTokens = aiResult.inputTokens;
      outputTokens = aiResult.outputTokens;
    } catch (aiErr) {
      if (reservationId) releaseReservation(reservationId).catch(() => {});
      throw aiErr;
    }

    if (reservationId) completeReservation(reservationId).catch(() => {});

    // Estimate cost (Haiku: $0.25/M input, $1.25/M output)
    const estimatedCost =
      (inputTokens / 1_000_000) * 0.25 +
      (outputTokens / 1_000_000) * 1.25;

    // Log cost usage async (don't await — don't block response)
    if (resolvedShopId && user.id) {
      logUsage({
        shopId: resolvedShopId,
        userId: user.id,
        feature: type,
        model: AI_MODEL,
        inputTokens,
        outputTokens,
        estimatedCost,
      });
    }

    logger.info('AI request completed', {
      module: 'api/ai',
      type,
      inputTokens,
      outputTokens,
    });

    return NextResponse.json({ result, mock: false, model: AI_MODEL });

  } catch (err) {
    logger.error('AI API route error', err, { module: 'api/ai' });
    return NextResponse.json(
      { error: 'AI request failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    provider: AI_PROVIDER,
    model: AI_MODEL,
    hasKey: !!ANTHROPIC_API_KEY,
    mockMode: !ANTHROPIC_API_KEY || AI_PROVIDER === 'mock',
    supportedTypes: Object.keys(PROMPT_REGISTRY),
  });
}
