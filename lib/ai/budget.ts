/**
 * Monthly AI budget and usage meter.
 *
 * Owner decision (2026-11-27): cap AI spend at $20 a month, with a usage
 * field to see where it stands. The cap covers the platform's own provider
 * key, so it is counted across every call this month, not per shop.
 *
 *   AI_MONTHLY_BUDGET_USD  optional override; default 20
 *
 * Every call is recorded in `ai_usage_events` with what the provider says it
 * cost (or an estimate from tokens). Before each call the month's total is
 * read; at or over the cap, AI is skipped and the feature falls back.
 * Fails CLOSED: if the month's spend cannot be read, no AI call is made.
 */

export const DEFAULT_MONTHLY_BUDGET_USD = 20;

export function monthlyBudgetUsd(env: NodeJS.ProcessEnv = process.env): number {
  const v = Number.parseFloat((env.AI_MONTHLY_BUDGET_USD ?? '').trim());
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_MONTHLY_BUDGET_USD;
}

/** First instant of the current calendar month, UTC, as ISO. */
export function monthStartUtc(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
  pricePerMTok: { input: number; output: number },
): number {
  return (Math.max(0, inputTokens) * pricePerMTok.input + Math.max(0, outputTokens) * pricePerMTok.output) / 1_000_000;
}

/** The cost to record: the provider's own figure when it gave one. */
export function costToRecord(
  reported: number | null,
  inputTokens: number,
  outputTokens: number,
  pricePerMTok: { input: number; output: number },
): number {
  return reported != null && Number.isFinite(reported) && reported >= 0
    ? reported
    : estimateCostUsd(inputTokens, outputTokens, pricePerMTok);
}

export interface BudgetState {
  spentUsd: number;
  capUsd: number;
  remainingUsd: number;
  /** 0–100, for the meter. */
  percentUsed: number;
  allowed: boolean;
}

export function budgetState(spentUsd: number, capUsd: number): BudgetState {
  const spent = Math.max(0, spentUsd);
  const cap = Math.max(0, capUsd);
  return {
    spentUsd: spent,
    capUsd: cap,
    remainingUsd: Math.max(0, cap - spent),
    percentUsed: cap > 0 ? Math.min(100, (spent / cap) * 100) : 100,
    allowed: spent < cap,
  };
}

// ── Database (server only) ───────────────────────────────────────────────────

type Db = { from(table: string): unknown };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const t = (db: Db, name: string) => db.from(name) as any;

export interface MonthUsage {
  spentUsd: number;
  requests: number;
}

/** This month's spend across all shops. Throws on a read error (callers fail closed). */
export async function readMonthUsage(db: Db, now = new Date()): Promise<MonthUsage> {
  const { data, error } = await t(db, 'ai_usage_events')
    .select('cost_usd')
    .gte('created_at', monthStartUtc(now));
  if (error) throw new Error(error.message ?? 'ai_usage_events read failed');
  const rows = (data ?? []) as { cost_usd: number | string | null }[];
  return {
    spentUsd: rows.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0),
    requests: rows.length,
  };
}

export interface UsageRow {
  shop_id: string;
  user_id: string | null;
  feature: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  cost_reported: boolean;
}

/** Record one call. Never throws: a metering write must not break the feature. */
export async function recordAiUsage(db: Db, row: UsageRow): Promise<void> {
  try {
    const { error } = await t(db, 'ai_usage_events').insert(row);
    if (error) console.error('[ai:usage] insert failed', error.message);
  } catch (e) {
    console.error('[ai:usage] insert errored', e instanceof Error ? e.message : e);
  }
}
