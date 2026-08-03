import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { aiRequestSchema } from '@/lib/validation/schemas';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { logger } from '@/lib/logger';
import { checkAiQuota } from '@/lib/ai/aiQuota';
import { recordUsage } from '@/commercial/usage/usageService';

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
    // Recorded in usage_records, not ai_usage_logs. The latter does not exist
    // in the database, so this write always failed — silently, because the
    // catch below logs a warning nobody reads and the call is not awaited.
    // That is why no AI limit was ever enforced: nothing was ever counted.
    //
    // usage_records already carries an 'ai_requests' key and the per-shop,
    // per-period shape the quota check reads. Token counts and cost go in
    // metadata, so the detail is not lost.
    await recordUsage(
      params.shopId,
      'ai_requests',
      1,
      {
        feature:        params.feature,
        model:          params.model,
        input_tokens:   params.inputTokens,
        output_tokens:  params.outputTokens,
        estimated_cost: params.estimatedCost,
        user_id:        params.userId,
      },
      'ai_request',
    );
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
      emailBody: `[MOCK] Dear ${context.customerName ?? 'Customer'},\n\nYour vehicle (${context.vehicle ?? 'on file'}) is currently ${context.status ?? 'being serviced'}.\n\nThank you for choosing ${context.shopName ?? 'My Shop'}.`,
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

    // Get prompt template
    const prompt = PROMPT_REGISTRY[type as keyof typeof PROMPT_REGISTRY];
    if (!prompt) {
      return NextResponse.json({ error: `Unknown task type: ${type}` }, { status: 400 });
    }

    // Mock mode if no API key or mock provider
    if (!ANTHROPIC_API_KEY || AI_PROVIDER === 'mock') {
      logger.info('AI running in mock mode', { module: 'api/ai', type });
      return NextResponse.json({
        result: mockResponse(type, context),
        mock: true,
        model: 'mock',
      });
    }

    // Enforce the daily limit BEFORE spending money. Every AI call bills the
    // platform's own Anthropic key, so an unbounded caller is a direct cost,
    // not merely a fairness problem.
    //
    // Checked after the mock-mode branch above deliberately: mock responses
    // cost nothing and should stay usable for development.
    const quota = await checkAiQuota(resolvedShopId);
    if (!quota.allowed) {
      logger.warn('AI request refused — daily limit reached', {
        module: 'api/ai', shopId: resolvedShopId, used: quota.used, limit: quota.limit, plan: quota.status,
      });
      return NextResponse.json(
        {
          error: 'Daily AI limit reached',
          detail: quota.limit === 0
            ? 'AI requests are not included in your plan.'
            : `You have used all ${quota.limit} AI requests for today. The limit resets at midnight UTC.`,
          used:  quota.used,
          limit: quota.limit,
          upgrade: quota.status !== 'pro',
        },
        { status: 429 },
      );
    }

    // Call AI
    const userMessage = prompt.buildUserMessage(context);
    const { result, inputTokens, outputTokens } = await callAnthropic(prompt.system, userMessage);

    // Estimate cost (Haiku: $0.25/M input, $1.25/M output)
    const estimatedCost =
      (inputTokens / 1_000_000) * 0.25 +
      (outputTokens / 1_000_000) * 1.25;

    // Awaited deliberately. This used to be fire-and-forget "so as not to block
    // the response", but on serverless an unawaited promise can be discarded
    // once the response is returned — so the very write the daily limit counts
    // might never land, leaving the counter permanently at zero. A few
    // milliseconds is worth a limit that actually holds.
    if (resolvedShopId && user.id) {
      await logUsage({
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
