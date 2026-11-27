/**
 * xAI (Grok) adapter — Responses API.
 *
 *   POST https://api.x.ai/v1/responses
 *   Authorization: Bearer $XAI_API_KEY
 *   { model, input: [{role, content}, …], max_output_tokens }
 *
 * The reply text is in `output[].content[]` items of type `output_text`.
 * `usage` carries input/output tokens and `cost_in_usd_ticks`
 * (10,000,000,000 ticks per US dollar), so the usage meter records what
 * xAI actually charged rather than an estimate.
 *
 * Server-only. Never throws; returns null on any failure.
 */
import type { TextModelProvider, TextRequest, TextResult } from './types';

const ENDPOINT = 'https://api.x.ai/v1/responses';
const TIMEOUT_MS = 10_000;
export const USD_TICKS = 10_000_000_000;

/** Cheapest non-reasoning text model on xAI's price list (2026-11-27). */
export const DEFAULT_XAI_MODEL = 'grok-4.20-0309-non-reasoning';
/** Its list price, USD per million tokens. Used only when xAI reports no cost. */
export const DEFAULT_XAI_PRICE = { input: 1.25, output: 2.5 };

/** Pull the reply text and usage out of a Responses API body. Pure, for tests. */
export function parseXaiResponse(body: unknown): Omit<TextResult, 'provider' | 'model'> | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  const parts: string[] = [];
  if (typeof b.output_text === 'string') parts.push(b.output_text);
  else if (Array.isArray(b.output)) {
    for (const item of b.output as Record<string, unknown>[]) {
      if (!item || !Array.isArray(item.content)) continue;
      for (const c of item.content as Record<string, unknown>[]) {
        if (c?.type === 'output_text' && typeof c.text === 'string') parts.push(c.text);
      }
    }
  }
  const text = parts.join('').trim();
  if (!text) return null;

  const usage = (b.usage ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const ticks = num(usage.cost_in_usd_ticks);
  const nano = num(usage.cost_in_nano_usd);
  return {
    text,
    inputTokens: num(usage.input_tokens) ?? num(usage.prompt_tokens) ?? 0,
    outputTokens: num(usage.output_tokens) ?? num(usage.completion_tokens) ?? 0,
    reportedCostUsd: ticks != null ? ticks / USD_TICKS : nano != null ? nano / 1e9 : null,
  };
}

function priceFromEnv(): { input: number; output: number } {
  const n = (v: string | undefined, d: number) => {
    const x = Number.parseFloat((v ?? '').trim());
    return Number.isFinite(x) && x >= 0 ? x : d;
  };
  return {
    input: n(process.env.XAI_PRICE_INPUT_PER_MTOK, DEFAULT_XAI_PRICE.input),
    output: n(process.env.XAI_PRICE_OUTPUT_PER_MTOK, DEFAULT_XAI_PRICE.output),
  };
}

export function createXaiProvider(apiKey: string, model = process.env.XAI_MODEL?.trim() || DEFAULT_XAI_MODEL): TextModelProvider {
  return {
    id: 'xai',
    model,
    pricePerMTok: priceFromEnv(),
    async complete(req: TextRequest): Promise<TextResult | null> {
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            input: [
              { role: 'system', content: req.system },
              { role: 'user', content: req.user },
            ],
            max_output_tokens: req.maxOutputTokens,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) {
          console.warn('[ai:xai] request failed', res.status);
          return null;
        }
        const parsed = parseXaiResponse(await res.json());
        return parsed ? { ...parsed, provider: 'xai', model } : null;
      } catch (e) {
        console.warn('[ai:xai] request errored', e instanceof Error ? e.message : e);
        return null;
      }
    },
  };
}
