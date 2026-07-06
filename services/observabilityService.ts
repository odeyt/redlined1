/**
 * Server-side observability service.
 * Writes structured logs to the observability_logs table in Supabase.
 * All operations are fire-and-forget — never crash the app if logging fails.
 */

import { getAdminDb } from '@/lib/supabaseServer';
import { getAppEnvironment } from '@/lib/environment';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ObsLogEntry {
  shop_id?: string | null;
  user_id?: string | null;
  level: LogLevel;
  event_type: string;
  message: string;
  route?: string | null;
  method?: string | null;
  status_code?: number | null;
  duration_ms?: number | null;
  metadata?: Record<string, unknown>;
}

export async function createLog(entry: ObsLogEntry): Promise<void> {
  try {
    const db = getAdminDb();
    await db.from('observability_logs').insert({
      ...entry,
      environment: getAppEnvironment(),
      metadata: entry.metadata ?? {},
    });
  } catch {
    // Never crash the app over a logging failure
  }
}

export async function recordApiMetric(opts: {
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
  shopId?: string;
  userId?: string;
  error?: string;
}): Promise<void> {
  const level: LogLevel = opts.statusCode >= 500 ? 'error' : opts.statusCode >= 400 ? 'warn' : 'info';
  await createLog({
    level,
    event_type: 'api_request',
    message: `${opts.method} ${opts.route} → ${opts.statusCode} (${opts.durationMs}ms)`,
    route: opts.route,
    method: opts.method,
    status_code: opts.statusCode,
    duration_ms: opts.durationMs,
    shop_id: opts.shopId ?? null,
    user_id: opts.userId ?? null,
    metadata: opts.error ? { error: opts.error } : {},
  });
}

export async function recordFeatureFlagEvent(opts: {
  flagKey: string;
  oldValue: boolean;
  newValue: boolean;
  scope: string;
  userId?: string;
  shopId?: string;
}): Promise<void> {
  await createLog({
    level: 'info',
    event_type: 'flag_toggle',
    message: `Flag "${opts.flagKey}" toggled ${opts.oldValue} → ${opts.newValue} (scope: ${opts.scope})`,
    shop_id: opts.shopId ?? null,
    user_id: opts.userId ?? null,
    metadata: {
      flag_key:  opts.flagKey,
      old_value: opts.oldValue,
      new_value: opts.newValue,
      scope:     opts.scope,
    },
  });
}

export interface RecentLog {
  id: string;
  level: string;
  event_type: string;
  message: string;
  route: string | null;
  status_code: number | null;
  duration_ms: number | null;
  environment: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

export async function listRecentLogs(shopId: string, limit = 50): Promise<RecentLog[]> {
  try {
    const db = getAdminDb();
    const { data } = await db
      .from('observability_logs')
      .select('id, level, event_type, message, route, status_code, duration_ms, environment, created_at, metadata')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []) as RecentLog[];
  } catch {
    return [];
  }
}

export async function listErrorLogs(shopId: string, limit = 20): Promise<RecentLog[]> {
  try {
    const db = getAdminDb();
    const { data } = await db
      .from('observability_logs')
      .select('id, level, event_type, message, route, status_code, duration_ms, environment, created_at, metadata')
      .eq('shop_id', shopId)
      .in('level', ['warn', 'error'])
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []) as RecentLog[];
  } catch {
    return [];
  }
}

export async function getHealthSummary(shopId: string): Promise<{
  errorCount24h: number;
  warnCount24h: number;
  lastError: RecentLog | null;
}> {
  try {
    const db = getAdminDb();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data } = await db
      .from('observability_logs')
      .select('id, level, event_type, message, route, status_code, duration_ms, environment, created_at, metadata')
      .eq('shop_id', shopId)
      .in('level', ['warn', 'error'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100);

    const rows = (data ?? []) as RecentLog[];
    return {
      errorCount24h: rows.filter(r => r.level === 'error').length,
      warnCount24h:  rows.filter(r => r.level === 'warn').length,
      lastError:     rows.find(r => r.level === 'error') ?? null,
    };
  } catch {
    return { errorCount24h: 0, warnCount24h: 0, lastError: null };
  }
}
