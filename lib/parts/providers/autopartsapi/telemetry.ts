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
  | 'cross_reference';

export interface UsageContext {
  shopId?: string;
  category: EndpointCategory;
}

export interface UsageRecord extends UsageContext {
  cacheHit: boolean;
  success: boolean;
  /** A classified kind from AutoPartsApiError. Never a provider message. */
  failureKind?: string;
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
  if (!record.shopId) return;
  try {
    await getAdminDb().from('parts_provider_usage_events').insert({
      shop_id: record.shopId,
      provider: 'autopartsapi',
      endpoint_category: record.category,
      cache_hit: record.cacheHit,
      success: record.success,
      failure_kind: record.failureKind ?? null,
    });
  } catch (err) {
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
  monthExternal: number;
  todayCacheHits: number;
  monthCacheHits: number;
  nominalAllowance: number;
  level: QuotaLevel;
  /**
   * Said out loud in the payload so no caller can render this as a balance.
   */
  note: string;
}

export async function usageSummary(shopId: string, now = new Date()): Promise<UsageSummary> {
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const db = getAdminDb();
  const { data } = await db
    .from('parts_provider_usage_events')
    .select('cache_hit, created_at')
    .eq('shop_id', shopId)
    .gte('created_at', startOfMonth.toISOString());

  const rows = (data ?? []) as Array<{ cache_hit: boolean; created_at: string }>;
  const inDay = (r: { created_at: string }) => Date.parse(r.created_at) >= startOfDay.getTime();

  const monthExternal = rows.filter(r => !r.cache_hit).length;

  return {
    todayExternal: rows.filter(r => !r.cache_hit && inDay(r)).length,
    monthExternal,
    todayCacheHits: rows.filter(r => r.cache_hit && inDay(r)).length,
    monthCacheHits: rows.filter(r => r.cache_hit).length,
    nominalAllowance: NOMINAL_MONTHLY_ALLOWANCE,
    level: quotaLevel(monthExternal),
    note: 'Locally recorded calls. AutoPartsAPI does not report remaining quota, '
      + 'so provider-side usage is authoritative.',
  };
}
