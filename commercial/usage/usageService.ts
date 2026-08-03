/**
 * commercial/usage/usageService.ts
 * Usage metering — tracks per-shop usage per billing period.
 */

import { getAdminDb } from '@/lib/supabaseServer';
import type { UsageKey, UsageRecord, MonthlyUsage } from '@/commercial/shared/types';

function periodBounds(date = new Date()): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end   = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export async function recordUsage(
  shopId: string,
  usageKey: UsageKey,
  quantity = 1,
  metadata: Record<string, unknown> = {},
  sourceType?: string,
  sourceId?: string,
): Promise<void> {
  try {
    const db = getAdminDb();
    const { start, end } = periodBounds();
    await db.from('usage_records').insert({
      shop_id:      shopId,
      usage_key:    usageKey,
      quantity,
      period_start: start.toISOString(),
      period_end:   end.toISOString(),
      source_type:  sourceType ?? null,
      source_id:    sourceId ?? null,
      metadata,
    });
  } catch (err) {
    console.error('[usageService] recordUsage error:', err);
  }
}

export async function getUsage(
  shopId: string,
  usageKey: UsageKey,
  period?: { start: Date; end: Date },
): Promise<number> {
  try {
    const db = getAdminDb();
    const { start, end } = period ?? periodBounds();

    const { data, error } = await db
      .from('usage_records')
      .select('quantity')
      .eq('shop_id', shopId)
      .eq('usage_key', usageKey)
      .gte('period_start', start.toISOString())
      .lte('period_end', end.toISOString());

    if (error) return 0;
    return (data ?? []).reduce((sum: number, r: { quantity: number }) => sum + (r.quantity ?? 0), 0);
  } catch {
    return 0;
  }
}

export async function getMonthlyUsage(shopId: string, date = new Date()): Promise<MonthlyUsage> {
  const period = periodBounds(date);

  const usageKeys: UsageKey[] = [
    'users', 'locations', 'vehicles', 'job_cards',
    'invoices', 'ai_requests', 'support_ai_requests', 'sms_sent', 'storage_mb',
  ];

  const counts = await Promise.all(
    usageKeys.map(key => getUsage(shopId, key, period)),
  );

  const usage = Object.fromEntries(
    usageKeys.map((key, i) => [key, counts[i]])
  ) as Record<UsageKey, number>;

  return { shopId, period, usage };
}

export async function resetUsageForNewPeriod(): Promise<void> {
  // Usage records are period-scoped — no deletion needed.
  // This function exists as a hook for any cleanup tasks (e.g. aggregation).
  console.info('[usageService] resetUsageForNewPeriod — usage is period-scoped, no action needed.');
}

export async function getUsageRecords(
  shopId: string,
  period?: { start: Date; end: Date },
): Promise<UsageRecord[]> {
  try {
    const db = getAdminDb();
    const { start, end } = period ?? periodBounds();

    const { data, error } = await db
      .from('usage_records')
      .select('*')
      .eq('shop_id', shopId)
      .gte('period_start', start.toISOString())
      .lte('period_end', end.toISOString())
      .order('created_at', { ascending: false });

    if (error) return [];

    return (data ?? []).map((r: Record<string, unknown>) => ({
      id:          String(r.id),
      shopId:      String(r.shop_id),
      usageKey:    String(r.usage_key) as UsageKey,
      quantity:    Number(r.quantity),
      periodStart: new Date(r.period_start as string),
      periodEnd:   new Date(r.period_end as string),
      sourceType:  (r.source_type as string) ?? null,
      sourceId:    (r.source_id as string) ?? null,
      metadata:    (r.metadata as Record<string, unknown>) ?? {},
      createdAt:   new Date(r.created_at as string),
    }));
  } catch {
    return [];
  }
}
