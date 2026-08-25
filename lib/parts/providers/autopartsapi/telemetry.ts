import 'server-only';

/**
 * Local accounting of what we spend at the provider.
 *
 * ## Why local, and what that means
 *
 * AutoPartsAPI does not report remaining quota, so nothing here can be
 * presented as authoritative. What Redlined1 knows is what Redlined1 asked
 * for — a floor, not a balance. The wording in the diagnostic follows from
 * that: "local calls recorded", never "calls remaining".
 *
 * ## Recorded centrally, not by callers
 *
 * Every external request goes through `autoPartsApiRequest`, and that is the
 * only place a usage row is written. A feature that had to remember to
 * increment a counter is a feature that will forget, and the number would
 * drift low — in the direction that hides a problem.
 *
 * ## What is deliberately not stored
 *
 * No key, no headers, no URL, no OEM number. A URL carries the part a shop is
 * looking up; a table of them is a record of what that shop is quoting, and
 * quota accounting does not need it. An endpoint CATEGORY answers "where did
 * the month go" without becoming search history.
 */
import { getAdminDb } from '@/lib/supabaseServer';
import { logger } from '@/lib/logger';

export type EndpointCategory =
  | 'reference'
  | 'manufacturers'
  | 'models'
  | 'vehicle_variants'
  | 'vehicle_detail'
  | 'oem_search'
  | 'oem_applicability'
  | 'cross_reference'
  /** Vehicle-first description search — M-PARTS2C. */
  | 'vehicle_parts_search';

/**
 * Who made the call.
 *
 * Required on every request, because the alternative was tried: the context
 * was optional, and the calls that omitted it vanished from accounting. That
 * included `oem_search` — the lookup every technician triggers — not just
 * ad-hoc scripts. A month's figure that silently excludes the main
 * application path is worse than no figure, because it reads as complete.
 *
 * Making it required moves the problem from "remember to pass it" to "will
 * not compile", which is the only version that stays true.
 */
export type PartsProviderCallContext =
  | 'application'    // a technician's search, through the app
  | 'qa'             // a repeatable QA/verification script
  | 'migration'      // one-off data work
  | 'maintenance'    // scheduled or operational
  | 'manual_probe';  // exploratory, run by hand

export interface UsageContext {
  shopId?: string;
  category: EndpointCategory;
  callContext: PartsProviderCallContext;
}

/**
 * What actually happened at the network boundary.
 *
 * Three outcomes, kept apart because one ambiguous counter cannot answer the
 * only question that matters — how many upstream requests were spent.
 *
 *   external   a real request left this process. Spends quota.
 *   cache_hit  our cache answered. Spends nothing.
 *   coalesced  an identical request was already in flight and this caller
 *              waited on it. Spends nothing, and is NOT the same as a cache
 *              hit: nothing was stored, two callers shared one journey.
 */
export type UsageOutcome = 'external' | 'cache_hit' | 'coalesced';

export interface UsageRecord extends UsageContext {
  outcome: UsageOutcome;
  success: boolean;
  /** A classified kind from AutoPartsApiError. Never a provider message. */
  failureKind?: string;
  /** Round-trip milliseconds, external calls only. */
  latencyMs?: number;
  /** 2xx / 4xx / 5xx, never the body. */
  statusClass?: string;
}

/**
 * Write one usage row. Never throws.
 *
 * Telemetry failing must not fail a parts search — losing a count is a
 * reporting problem, losing the search is the technician's problem. Without a
 * shop we simply do not record: the table is shop-scoped, and a row with no
 * tenant is unattributable noise.
 */
export async function recordUsage(record: UsageRecord): Promise<void> {
  // A call with no shop is still a call. QA scripts, probes and maintenance
  // have no tenant, and dropping them is precisely how 10 real requests were
  // recorded as 7. The column is nullable so they land.
  try {
    await getAdminDb().from('parts_provider_usage_events').insert({
      shop_id: record.shopId ?? null,
      provider: 'autopartsapi',
      endpoint_category: record.category,
      call_context: record.callContext,
      cache_hit: record.outcome !== 'external',
      outcome: record.outcome,
      success: record.success,
      failure_kind: record.failureKind ?? null,
      latency_ms: record.latencyMs ?? null,
      status_class: record.statusClass ?? null,
    });
  } catch (err) {
    // Telemetry failing must never fail a parts search. Losing a count is a
    // reporting problem; losing the search is the technician's problem.
    logger.warn('parts.autopartsapi.usage_record_failed', {
      reason: err instanceof Error ? err.message.slice(0, 80) : 'unknown',
    });
  }
}

// ─── Diagnostic ──────────────────────────────────────────────────────────────

/**
 * The nominal free-plan allowance, for context only.
 *
 * Configurable because it is a fact about the subscription rather than about
 * the code, and it is presented as what it is — a plan figure to compare a
 * local count against, not a balance the provider confirmed.
 */
export const NOMINAL_MONTHLY_ALLOWANCE =
  Number(process.env.AUTOPARTS_MONTHLY_ALLOWANCE ?? 100);

export type QuotaLevel = 'normal' | 'warning' | 'critical';

/** Thresholds over the LOCAL count. Configurable, and documented as local. */
export const WARNING_AT = Number(process.env.AUTOPARTS_WARN_PCT ?? 70) / 100;
export const CRITICAL_AT = Number(process.env.AUTOPARTS_CRITICAL_PCT ?? 90) / 100;

export function quotaLevel(externalThisMonth: number, allowance = NOMINAL_MONTHLY_ALLOWANCE): QuotaLevel {
  if (allowance <= 0) return 'normal';
  const used = externalThisMonth / allowance;
  if (used >= CRITICAL_AT) return 'critical';
  if (used >= WARNING_AT) return 'warning';
  return 'normal';
}

export interface UsageSummary {
  todayExternal: number;
  todayCacheHits: number;
  todayCoalesced: number;

  monthExternal: number;
  monthCacheHits: number;
  monthCoalesced: number;

  /** External calls this month, split by who made them. */
  monthByContext: Record<PartsProviderCallContext, number>;

  nominalAllowance: number;
  level: QuotaLevel;
  /** Said out loud in the payload so no caller can render this as a balance. */
  note: string;
}

interface UsageRow {
  cache_hit: boolean;
  outcome: string | null;
  call_context: string | null;
  created_at: string;
}

const EMPTY_BY_CONTEXT: Record<PartsProviderCallContext, number> = {
  application: 0, qa: 0, migration: 0, maintenance: 0, manual_probe: 0,
};

/**
 * Usage for one shop, or across every context when `shopId` is null.
 *
 * The all-shops view exists because QA and probe calls have no tenant and
 * would otherwise be invisible — which is the exact shape of the bug this
 * milestone exists to fix.
 */
export async function usageSummary(
  shopId: string | null,
  now = new Date(),
): Promise<UsageSummary> {
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  let q = getAdminDb()
    .from('parts_provider_usage_events')
    .select('cache_hit, outcome, call_context, created_at')
    .gte('created_at', startOfMonth.toISOString());
  if (shopId) q = q.eq('shop_id', shopId);

  const { data } = await q;
  const rows = (data ?? []) as UsageRow[];

  // `outcome` is authoritative where present; `cache_hit` is the fallback for
  // rows written before the column existed.
  const outcomeOf = (r: UsageRow): UsageOutcome =>
    (r.outcome as UsageOutcome | null) ?? (r.cache_hit ? 'cache_hit' : 'external');
  const inDay = (r: UsageRow) => Date.parse(r.created_at) >= startOfDay.getTime();
  const count = (pred: (r: UsageRow) => boolean) => rows.filter(pred).length;

  const monthByContext = { ...EMPTY_BY_CONTEXT };
  for (const r of rows) {
    if (outcomeOf(r) !== 'external') continue;
    const ctx = (r.call_context as PartsProviderCallContext | null) ?? 'application';
    if (ctx in monthByContext) monthByContext[ctx] += 1;
  }

  const monthExternal = count(r => outcomeOf(r) === 'external');

  return {
    todayExternal: count(r => outcomeOf(r) === 'external' && inDay(r)),
    todayCacheHits: count(r => outcomeOf(r) === 'cache_hit' && inDay(r)),
    todayCoalesced: count(r => outcomeOf(r) === 'coalesced' && inDay(r)),

    monthExternal,
    monthCacheHits: count(r => outcomeOf(r) === 'cache_hit'),
    monthCoalesced: count(r => outcomeOf(r) === 'coalesced'),

    monthByContext,
    nominalAllowance: NOMINAL_MONTHLY_ALLOWANCE,
    level: quotaLevel(monthExternal),
    note: 'Locally recorded calls. AutoPartsAPI does not report remaining quota, '
      + 'so provider-side usage is authoritative.',
  };
}
