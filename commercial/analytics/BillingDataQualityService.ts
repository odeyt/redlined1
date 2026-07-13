/**
 * commercial/analytics/BillingDataQualityService.ts
 * Detects data integrity issues across billing tables.
 * Read-only. Used to surface warnings in the admin dashboard.
 */

import { getAdminDb } from '@/lib/supabaseServer';
import { getInternalShopIds } from '@/lib/adminAuth';

export type DataQualitySeverity = 'error' | 'warning' | 'info';

export interface DataQualityIssue {
  code: string;
  severity: DataQualitySeverity;
  message: string;
  affectedCount: number;
  examples: string[];
}

const KNOWN_PLAN_KEYS = new Set([
  'trial', 'solo', 'starter', 'professional', 'shop_pro',
  'business', 'enterprise', 'internal',
]);

export async function runDataQualityChecks(): Promise<DataQualityIssue[]> {
  const db = getAdminDb();
  const internal = getInternalShopIds();
  const issues: DataQualityIssue[] = [];

  // 1. Unknown plan keys
  try {
    const { data } = await db
      .from('shop_subscriptions')
      .select('shop_id, plan_key')
      .not('shop_id', 'in', `(${[...internal].map(id => `'${id}'`).join(',')})`);

    const unknown = (data ?? []).filter(r => !KNOWN_PLAN_KEYS.has(r.plan_key));
    if (unknown.length > 0) {
      issues.push({
        code: 'UNKNOWN_PLAN_KEY',
        severity: 'error',
        message: 'Subscription records with unrecognized plan_key values.',
        affectedCount: unknown.length,
        examples: unknown.slice(0, 3).map(r => `shop:${r.shop_id} plan:${r.plan_key}`),
      });
    }
  } catch { /* table may not exist yet */ }

  // 2. Trial end before trial start
  try {
    const { data } = await db
      .from('shop_subscriptions')
      .select('shop_id, trial_start, trial_end')
      .not('trial_start', 'is', null)
      .not('trial_end', 'is', null);

    const invalid = (data ?? []).filter(r =>
      r.trial_start && r.trial_end &&
      new Date(r.trial_end) < new Date(r.trial_start)
    );
    if (invalid.length > 0) {
      issues.push({
        code: 'TRIAL_END_BEFORE_START',
        severity: 'error',
        message: 'Trial end date is before trial start date.',
        affectedCount: invalid.length,
        examples: invalid.slice(0, 3).map(r => `shop:${r.shop_id}`),
      });
    }
  } catch { /* ok */ }

  // 3. Active subscription but status inconsistency
  try {
    const { data } = await db
      .from('shop_subscriptions')
      .select('shop_id, status, cancel_at_period_end, cancelled_at')
      .eq('status', 'active')
      .not('cancelled_at', 'is', null);

    if ((data ?? []).length > 0) {
      issues.push({
        code: 'ACTIVE_WITH_CANCELLED_AT',
        severity: 'warning',
        message: 'Subscriptions marked active but have a cancelled_at timestamp set.',
        affectedCount: (data ?? []).length,
        examples: (data ?? []).slice(0, 3).map(r => `shop:${r.shop_id}`),
      });
    }
  } catch { /* ok */ }

  // 4. Duplicated provider subscription IDs
  try {
    const { data } = await db
      .from('shop_subscriptions')
      .select('provider_subscription_id')
      .not('provider_subscription_id', 'is', null);

    const seen = new Map<string, number>();
    for (const r of (data ?? [])) {
      if (r.provider_subscription_id) {
        seen.set(r.provider_subscription_id, (seen.get(r.provider_subscription_id) ?? 0) + 1);
      }
    }
    const dupes = [...seen.entries()].filter(([, count]) => count > 1);
    if (dupes.length > 0) {
      issues.push({
        code: 'DUPLICATE_PROVIDER_SUBSCRIPTION_ID',
        severity: 'error',
        message: 'Provider subscription ID appears on multiple shop_subscriptions rows.',
        affectedCount: dupes.length,
        examples: dupes.slice(0, 3).map(([id]) => `provider_sub:${id}`),
      });
    }
  } catch { /* ok */ }

  // 5. Unprocessed billing events older than 1 hour
  try {
    const cutoff = new Date(Date.now() - 3600000).toISOString();
    const { data } = await db
      .from('billing_events')
      .select('id, event_type, created_at')
      .eq('processed', false)
      .is('error', null)
      .lte('created_at', cutoff)
      .limit(20);

    if ((data ?? []).length > 0) {
      issues.push({
        code: 'STALE_UNPROCESSED_WEBHOOK',
        severity: 'warning',
        message: 'Billing events unprocessed for more than 1 hour with no error logged.',
        affectedCount: (data ?? []).length,
        examples: (data ?? []).slice(0, 3).map(r => `${r.event_type} at ${r.created_at}`),
      });
    }
  } catch { /* ok */ }

  // 6. Internal shops in commercial metrics (detect if billing_events reference internal shops)
  try {
    if (internal.size > 0) {
      const internalList = [...internal];
      const { data } = await db
        .from('billing_events')
        .select('shop_id')
        .in('shop_id', internalList)
        .limit(5);

      if ((data ?? []).length > 0) {
        issues.push({
          code: 'INTERNAL_SHOP_IN_BILLING_EVENTS',
          severity: 'warning',
          message: 'Internal D1 shop IDs appear in billing_events. Verify they are excluded from revenue metrics.',
          affectedCount: (data ?? []).length,
          examples: [],
        });
      }
    }
  } catch { /* ok */ }

  // 7. Missing billing interval on active subscriptions
  try {
    const { data } = await db
      .from('shop_subscriptions')
      .select('shop_id, plan_key, metadata')
      .eq('status', 'active');

    const missingInterval = (data ?? []).filter(r => {
      if (internal.has(r.shop_id)) return false;
      const meta = r.metadata as Record<string, string> | null;
      return !meta?.billing_interval;
    });

    if (missingInterval.length > 0) {
      issues.push({
        code: 'MISSING_BILLING_INTERVAL',
        severity: 'info',
        message: 'Active subscriptions without billing_interval in metadata. Defaulting to monthly for MRR calculation.',
        affectedCount: missingInterval.length,
        examples: missingInterval.slice(0, 3).map(r => `shop:${r.shop_id}`),
      });
    }
  } catch { /* ok */ }

  // 8. Negative revenue values (can't happen from schema but guard anyway)
  try {
    const { data } = await db
      .from('billing_events')
      .select('id, payload')
      .in('event_type', ['refund.created', 'charge.refunded'])
      .limit(100);

    const negative = (data ?? []).filter(r => {
      const p = r.payload as Record<string, unknown> | null;
      return typeof p?.amount === 'number' && p.amount < 0;
    });

    if (negative.length > 0) {
      issues.push({
        code: 'NEGATIVE_REFUND_AMOUNT',
        severity: 'warning',
        message: 'Refund events with negative amount values detected.',
        affectedCount: negative.length,
        examples: [],
      });
    }
  } catch { /* ok */ }

  return issues;
}
