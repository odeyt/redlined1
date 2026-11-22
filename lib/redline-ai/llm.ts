/**
 * Redline AI — optional LLM pass.
 *
 * Mirrors the existing /api/ai Anthropic pattern (same env vars, same
 * endpoint) but asks for plain text instead of JSON. It is used ONLY to
 * rephrase a deterministic answer or to write a follow-up draft from facts
 * the deterministic layer already gathered.
 *
 * Graceful degradation is a hard requirement, not a nicety: production
 * Anthropic billing has failed before, so ANY failure here — no key, mock
 * provider, network error, timeout, non-200, empty body — returns null and
 * the caller falls back to the deterministic answer. This module never
 * throws to its caller.
 */
import { logger } from '@/lib/logger';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const AI_MODEL = process.env.AI_MODEL ?? 'claude-haiku-4-5-20251001';
const AI_PROVIDER = process.env.AI_PROVIDER ?? 'anthropic';
const LLM_TIMEOUT_MS = 15_000;

export function llmConfigured(): boolean {
  return !!ANTHROPIC_API_KEY && AI_PROVIDER !== 'mock';
}

async function callAnthropicText(system: string, userMessage: string): Promise<string | null> {
  if (!llmConfigured()) return null;
  try {
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
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn('Redline AI LLM call failed', { module: 'redline-ai', status: res.status });
      return null;
    }
    const data = await res.json();
    const text = String(data.content?.[0]?.text ?? '').trim();
    return text || null;
  } catch (err) {
    logger.warn('Redline AI LLM call errored — using deterministic answer', {
      module: 'redline-ai',
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

const REPHRASE_SYSTEM = [
  'You rephrase shop-management briefings for a repair-shop owner.',
  'Rules: keep EVERY number, amount, currency, date, name, and document',
  'reference exactly as given — never add, remove, round, or change one.',
  'Keep the same structure and line breaks where practical. Plain text only.',
  'If the input says nothing is owed / nothing is stale, keep that meaning.',
].join(' ');

/** Rephrase a deterministic answer. Returns null when the LLM is unusable. */
export async function rephraseAnswer(deterministic: string): Promise<string | null> {
  return callAnthropicText(REPHRASE_SYSTEM, deterministic);
}

const DRAFT_SYSTEM = [
  'You write short, polite follow-up messages for an auto repair shop.',
  'Use ONLY the facts in the JSON provided — never invent amounts, dates,',
  'names, or document numbers. One short paragraph, friendly and professional,',
  'no subject line, no placeholders. The message is a draft for staff to',
  'review; it is never sent by you.',
].join(' ');

/** Draft a follow-up from verified facts. Returns null when unusable. */
export async function draftWithLlm(facts: Record<string, unknown>): Promise<string | null> {
  return callAnthropicText(DRAFT_SYSTEM, JSON.stringify(facts));
}
