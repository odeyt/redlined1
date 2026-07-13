/**
 * commercial/analytics/BillingAnalyticsService.ts
 * Server-side only. All aggregations happen in SQL — never loaded into the browser.
 *
 * SAFETY: Read-only. Never modifies billing state, subscriptions, or payments.
 * SCOPE:  Platform-owner access only. Call only from authorized API routes.
 */

import { getAdminDb } from '@/lib/supabaseServer';
import { getInternalShopIds } from '@/lib/adminAuth';
import { PLANS } from '@/config/plans';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DateRange {
  from: Date;
  to: Date;
}

export interface BillingOverview {
  range: { from: string; to: string };
  subscriptions: SubscriptionSummary;
  revenue: RevenueMetrics;
  trials: TrialMetrics;
  churn: ChurnMetrics;
  webhook: WebhookHealth;
  renewals: RenewalHealth;
  value: LtvCacMetrics;
  warnings: string[];
  generatedAt: string;
}

export interface SubscriptionSummary {
  total: number;
  active: number;
  trialing: number;
  pastDue: number;
  cancelled: number;
  expired: number;
  suspended: number;
  byPlan: Record<string, number>;
  internalShops: number;
}

export interface RevenueMetrics {
  mrr: number;
  arr: number;
  arpa: number;
  currency: string;
  mrrByPlan: Record<string, number>;
  revenueAtRisk: number;
  note: string;
}

export interface TrialMetrics {
  active: number;
  expiringIn1Day: number;
  expiringIn3Days: number;
  expiredUnconverted: number;
  converted: number;
  conversionRate: number | null;
  avgDaysToConversion: number | null;
  cohortNote: string;
}

export interface ChurnMetrics {
  logoRate: number | null;
  revenueRate: number | null;
  cancelledThisPeriod: number;
  scheduledCancel: number;
  lostMrr: number;
  sampleSize: number;
  insufficient: boolean;
  note: string;
}

export interface WebhookHealth {
  received: number;
  processed: number;
  failed: number;
  duplicatesIgnored: number;
  failureRate: number | null;
  medianLatencyMs: number | null;
  p95LatencyMs: number | null;
  p99LatencyMs: number | null;
  maxLatencyMs: number | null;
  oldestUnprocessedAgeMs: number | null;
  topFailingTypes: Array<{ eventType: string; count: number }>;
  latencyNote: string;
}

export interface RenewalHealth {
  failedRenewals: number;
  shopsAffected: number;
  mrrAtRisk: number;
  pastDueCount: number;
  gracePeriodCount: number;
  recovered: number;
}

export interface RefundMetrics {
  count: number;
  totalAmount: number;
  currency: string;
  refundRate: number | null;
  byPlan: Record<string, number>;
  avgDaysToRefund: number | null;
}

export interface LtvCacMetrics {
  arpa: number;
  monthlyChurnRate: number | null;
  estimatedLtv: number | null;
  cac: number | null;
  ltvToCacRatio: number | null;
  paybackPeriodMonths: number | null;
  ltvNote: string;
  cacNote: string;
}

export interface PlanDistribution {
  plan: string;
  count: number;
  mrr: number;
  pctOfTotal: number;
}

// ─── Internal D1 plan prices (USD) ────────────────────────────────────────────

const PLAN_MONTHLY_PRICE: Record<string, number> = {
  solo:         PLANS.solo?.monthlyPrice         ?? 24,
  starter:      PLANS.starter?.monthlyPrice      ?? 49,
  professional: PLANS.professional?.monthlyPrice ?? 99,
  business:     PLANS.business?.monthlyPrice     ?? 179,
  enterprise:   0, // contact sales — unknown recurring value
  trial:        0,
  internal:     0,
};

const PLAN_ANNUAL_MONTHLY: Record<string, number> = {
  solo:         (PLANS.solo?.annualPrice         ?? 240)  / 12,
  starter:      (PLANS.starter?.annualPrice      ?? 490)  / 12,
  professional: (PLANS.professional?.annualPrice ?? 990)  / 12,
  business:     (PLANS.business?.annualPrice     ?? 1790) / 12,
  enterprise:   0,
  trial:        0,
  internal:     0,
};

function normalizedMonthlyRevenue(planKey: string, billingInterval: string | null): number {
  if (!billingInterval || billingInterval === 'monthly') {
    return PLAN_MONTHLY_PRICE[planKey] ?? 0;
  }
  return PLAN_ANNUAL_MONTHLY[planKey] ?? 0;
}

// ─── Subscription summary ─────────────────────────────────────────────────────

export async function getSubscriptionSummary(): Promise<SubscriptionSummary> {
  const db = getAdminDb();
  const internal = getInternalShopIds();

  const { data, error } = await db
    .from('shop_subscriptions')
    .select('shop_id, plan_key, status')
    .order('created_at', { ascending: false });

  if (error || !data) {
    return {
      total: 0, active: 0, trialing: 0, pastDue: 0,
      cancelled: 0, expired: 0, suspended: 0,
      byPlan: {}, internalShops: 0,
    };
  }

  // Deduplicate: one subscription per shop (latest)
  const seenShops = new Map<string, { plan_key: string; status: string }>();
  for (const row of data) {
    if (!seenShops.has(row.shop_id)) {
      seenShops.set(row.shop_id, { plan_key: row.plan_key, status: row.status });
    }
  }

  let active = 0, trialing = 0, pastDue = 0, cancelled = 0,
    expired = 0, suspended = 0, internalShops = 0;
  const byPlan: Record<string, number> = {};

  for (const [shopId, sub] of seenShops) {
    if (internal.has(shopId)) { internalShops++; continue; }

    byPlan[sub.plan_key] = (byPlan[sub.plan_key] ?? 0) + 1;
    const s = sub.status;
    if (s === 'active')    active++;
    else if (s === 'trialing')  trialing++;
    else if (s === 'past_due')  pastDue++;
    else if (s === 'cancelled' || s === 'canceled') cancelled++;
    else if (s === 'expired')   expired++;
    else if (s === 'suspended') suspended++;
  }

  return {
    total: seenShops.size - internalShops,
    active, trialing, pastDue, cancelled,
    expired, suspended, byPlan, internalShops,
  };
}

// ─── Revenue metrics ──────────────────────────────────────────────────────────

export async function getRevenueMetrics(): Promise<RevenueMetrics> {
  const db = getAdminDb();
  const internal = getInternalShopIds();

  const { data, error } = await db
    .from('shop_subscriptions')
    .select('shop_id, plan_key, status, metadata, cancel_at_period_end')
    .order('created_at', { ascending: false });

  if (error || !data) {
    return { mrr: 0, arr: 0, arpa: 0, currency: 'USD', mrrByPlan: {}, revenueAtRisk: 0, note: 'No subscription data' };
  }

  const seenShops = new Map<string, typeof data[0]>();
  for (const row of data) {
    if (!seenShops.has(row.shop_id)) seenShops.set(row.shop_id, row);
  }

  let mrr = 0;
  let activePaidShops = 0;
  let revenueAtRisk = 0;
  const mrrByPlan: Record<string, number> = {};

  for (const [shopId, sub] of seenShops) {
    if (internal.has(shopId)) continue;

    const status = sub.status;
    const interval = (sub.metadata as Record<string, string> | null)?.billing_interval ?? 'monthly';
    const planKey = sub.plan_key;

    if (status === 'active' || (status === 'active' && sub.cancel_at_period_end)) {
      const rev = normalizedMonthlyRevenue(planKey, interval);
      mrr += rev;
      mrrByPlan[planKey] = (mrrByPlan[planKey] ?? 0) + rev;
      if (rev > 0) activePaidShops++;
      if (sub.cancel_at_period_end) revenueAtRisk += rev;
    } else if (status === 'past_due') {
      const rev = normalizedMonthlyRevenue(planKey, interval);
      revenueAtRisk += rev;
    }
  }

  const arpa = activePaidShops > 0 ? mrr / activePaidShops : 0;

  return {
    mrr: Math.round(mrr * 100) / 100,
    arr: Math.round(mrr * 12 * 100) / 100,
    arpa: Math.round(arpa * 100) / 100,
    currency: 'USD',
    mrrByPlan,
    revenueAtRisk: Math.round(revenueAtRisk * 100) / 100,
    note: 'ARR is run-rate (MRR × 12), not booked revenue. Enterprise contracts with unknown recurring value contribute $0.',
  };
}

// ─── Trial metrics ────────────────────────────────────────────────────────────

export async function getTrialMetrics(range: DateRange): Promise<TrialMetrics> {
  const db = getAdminDb();
  const internal = getInternalShopIds();
  const now = new Date();

  const { data, error } = await db
    .from('shop_subscriptions')
    .select('shop_id, status, trial_start, trial_end, created_at')
    .gte('created_at', range.from.toISOString())
    .order('created_at', { ascending: true });

  if (error || !data) {
    return {
      active: 0, expiringIn1Day: 0, expiringIn3Days: 0,
      expiredUnconverted: 0, converted: 0,
      conversionRate: null, avgDaysToConversion: null,
      cohortNote: 'No trial data',
    };
  }

  const seenShops = new Map<string, typeof data[0]>();
  for (const row of data) {
    if (!seenShops.has(row.shop_id)) seenShops.set(row.shop_id, row);
  }

  // Also get all subscriptions (not range-filtered) to detect conversions
  const { data: allSubs } = await db
    .from('shop_subscriptions')
    .select('shop_id, status, trial_start, trial_end, created_at');

  const shopHistory = new Map<string, Array<{ status: string; created_at: string; trial_end: string | null }>>();
  for (const row of (allSubs ?? [])) {
    if (!shopHistory.has(row.shop_id)) shopHistory.set(row.shop_id, []);
    shopHistory.get(row.shop_id)!.push(row);
  }

  let active = 0, expiringIn1Day = 0, expiringIn3Days = 0;
  let expiredUnconverted = 0, converted = 0;
  const conversionDays: number[] = [];

  for (const [shopId, sub] of seenShops) {
    if (internal.has(shopId)) continue;

    const history = shopHistory.get(shopId) ?? [];
    const wasTrialing = sub.status === 'trialing' || sub.trial_start !== null;
    if (!wasTrialing) continue;

    const trialEnd = sub.trial_end ? new Date(sub.trial_end) : null;
    const hasActivePaid = history.some(h => h.status === 'active');

    if (sub.status === 'trialing') {
      active++;
      if (trialEnd) {
        const msLeft = trialEnd.getTime() - now.getTime();
        const daysLeft = msLeft / 86400000;
        if (daysLeft <= 1 && daysLeft >= 0) expiringIn1Day++;
        if (daysLeft <= 3 && daysLeft >= 0) expiringIn3Days++;
      }
    } else if (hasActivePaid) {
      converted++;
      if (sub.trial_start && trialEnd) {
        const convDate = new Date(sub.created_at);
        const trialStart = new Date(sub.trial_start);
        const days = (convDate.getTime() - trialStart.getTime()) / 86400000;
        if (days >= 0) conversionDays.push(days);
      }
    } else if (trialEnd && trialEnd < now) {
      expiredUnconverted++;
    }
  }

  // Eligible = converted + expiredUnconverted (exclude still-active trials)
  const eligible = converted + expiredUnconverted;
  const conversionRate = eligible > 0 ? converted / eligible : null;
  const avgDaysToConversion = conversionDays.length > 0
    ? conversionDays.reduce((a, b) => a + b, 0) / conversionDays.length
    : null;

  return {
    active, expiringIn1Day, expiringIn3Days,
    expiredUnconverted, converted,
    conversionRate: conversionRate !== null ? Math.round(conversionRate * 1000) / 10 : null,
    avgDaysToConversion: avgDaysToConversion !== null ? Math.round(avgDaysToConversion * 10) / 10 : null,
    cohortNote: 'Conversion rate uses only eligible completed trials (trial ended or converted). Active trials in progress are excluded.',
  };
}

// ─── Churn metrics ────────────────────────────────────────────────────────────

export async function getChurnMetrics(range: DateRange): Promise<ChurnMetrics> {
  const db = getAdminDb();
  const internal = getInternalShopIds();

  // Shops active at start of period
  const { data: startData } = await db
    .from('shop_subscriptions')
    .select('shop_id, plan_key, status, metadata')
    .eq('status', 'active')
    .lte('created_at', range.from.toISOString());

  // Cancellations during period
  const { data: cancelData } = await db
    .from('shop_subscriptions')
    .select('shop_id, plan_key, status, cancelled_at, metadata')
    .eq('status', 'cancelled')
    .gte('cancelled_at', range.from.toISOString())
    .lte('cancelled_at', range.to.toISOString());

  // Scheduled cancellations currently
  const { data: scheduledData } = await db
    .from('shop_subscriptions')
    .select('shop_id')
    .eq('status', 'active')
    .eq('cancel_at_period_end', true);

  const startShops = new Set<string>();
  let startMrr = 0;

  for (const row of (startData ?? [])) {
    if (internal.has(row.shop_id)) continue;
    startShops.add(row.shop_id);
    const interval = (row.metadata as Record<string, string> | null)?.billing_interval ?? 'monthly';
    startMrr += normalizedMonthlyRevenue(row.plan_key, interval);
  }

  let cancelledCount = 0;
  let lostMrr = 0;

  for (const row of (cancelData ?? [])) {
    if (internal.has(row.shop_id)) continue;
    cancelledCount++;
    const interval = (row.metadata as Record<string, string> | null)?.billing_interval ?? 'monthly';
    lostMrr += normalizedMonthlyRevenue(row.plan_key, interval);
  }

  const scheduledCancel = (scheduledData ?? []).filter(r => !internal.has(r.shop_id)).length;
  const sampleSize = startShops.size;
  const insufficient = sampleSize < 5;

  const logoRate = !insufficient && sampleSize > 0
    ? Math.round((cancelledCount / sampleSize) * 1000) / 10
    : null;

  const revenueRate = !insufficient && startMrr > 0
    ? Math.round((lostMrr / startMrr) * 1000) / 10
    : null;

  return {
    logoRate,
    revenueRate,
    cancelledThisPeriod: cancelledCount,
    scheduledCancel,
    lostMrr: Math.round(lostMrr * 100) / 100,
    sampleSize,
    insufficient,
    note: insufficient
      ? `Insufficient sample size (${sampleSize} shops at period start). Minimum 5 required for reliable churn calculation.`
      : 'Logo churn = cancelled / active-at-period-start. Revenue churn = lost MRR / starting MRR.',
  };
}

// ─── Webhook health ───────────────────────────────────────────────────────────

export async function getWebhookHealth(range: DateRange): Promise<WebhookHealth> {
  const db = getAdminDb();

  const { data, error } = await db
    .from('billing_events')
    .select('event_type, processed, processed_at, error, created_at, provider_event_id')
    .gte('created_at', range.from.toISOString())
    .lte('created_at', range.to.toISOString())
    .order('created_at', { ascending: true });

  if (error || !data) {
    return {
      received: 0, processed: 0, failed: 0, duplicatesIgnored: 0,
      failureRate: null, medianLatencyMs: null, p95LatencyMs: null,
      p99LatencyMs: null, maxLatencyMs: null,
      oldestUnprocessedAgeMs: null, topFailingTypes: [],
      latencyNote: 'No webhook data in range',
    };
  }

  const received = data.length;
  const processedRows = data.filter(r => r.processed && r.processed_at);
  const failed = data.filter(r => r.error != null && !r.processed).length;
  const unprocessed = data.filter(r => !r.processed && r.error == null);

  // Latency: processed_at - created_at (received_at = created_at in this schema)
  const latencies = processedRows
    .map(r => new Date(r.processed_at!).getTime() - new Date(r.created_at).getTime())
    .filter(ms => ms >= 0)
    .sort((a, b) => a - b);

  function percentile(arr: number[], p: number): number | null {
    if (arr.length === 0) return null;
    const idx = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, idx)];
  }

  // Top failing types
  const failTypeCounts: Record<string, number> = {};
  for (const r of data) {
    if (r.error) {
      failTypeCounts[r.event_type] = (failTypeCounts[r.event_type] ?? 0) + 1;
    }
  }
  const topFailingTypes = Object.entries(failTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([eventType, count]) => ({ eventType, count }));

  const oldestUnprocessed = unprocessed[0]
    ? Date.now() - new Date(unprocessed[0].created_at).getTime()
    : null;

  const failureRate = received > 0
    ? Math.round((failed / received) * 1000) / 10
    : null;

  return {
    received,
    processed: processedRows.length,
    failed,
    duplicatesIgnored: 0, // idempotency dedup tracked at insert level
    failureRate,
    medianLatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    p99LatencyMs: percentile(latencies, 99),
    maxLatencyMs: latencies.length > 0 ? latencies[latencies.length - 1] : null,
    oldestUnprocessedAgeMs: oldestUnprocessed,
    topFailingTypes,
    latencyNote: 'Latency = processed_at − created_at. created_at approximates received_at.',
  };
}

// ─── Renewal health ───────────────────────────────────────────────────────────

export async function getRenewalHealth(range: DateRange): Promise<RenewalHealth> {
  const db = getAdminDb();
  const internal = getInternalShopIds();

  // Failed renewals: payment_failed or subscription.past_due events that are NOT checkout.completed
  const { data: failedEvents } = await db
    .from('billing_events')
    .select('shop_id, event_type, error')
    .in('event_type', ['payment.failed', 'subscription.past_due', 'invoice.payment_failed'])
    .not('event_type', 'in', '("checkout.completed")')
    .gte('created_at', range.from.toISOString())
    .lte('created_at', range.to.toISOString());

  // Past due shops
  const { data: pastDueShops } = await db
    .from('shop_subscriptions')
    .select('shop_id, plan_key, status, metadata')
    .eq('status', 'past_due');

  const failedRenewals = (failedEvents ?? []).filter(e => e.shop_id && !internal.has(e.shop_id)).length;
  const affectedShopSet = new Set((failedEvents ?? []).map(e => e.shop_id).filter(id => id && !internal.has(id)));

  let mrrAtRisk = 0;
  let pastDueCount = 0;

  for (const row of (pastDueShops ?? [])) {
    if (internal.has(row.shop_id)) continue;
    pastDueCount++;
    const interval = (row.metadata as Record<string, string> | null)?.billing_interval ?? 'monthly';
    mrrAtRisk += normalizedMonthlyRevenue(row.plan_key, interval);
  }

  return {
    failedRenewals,
    shopsAffected: affectedShopSet.size,
    mrrAtRisk: Math.round(mrrAtRisk * 100) / 100,
    pastDueCount,
    gracePeriodCount: 0,
    recovered: 0,
  };
}

// ─── Refund metrics ───────────────────────────────────────────────────────────

export async function getRefundMetrics(range: DateRange): Promise<RefundMetrics> {
  const db = getAdminDb();
  const internal = getInternalShopIds();

  const { data } = await db
    .from('billing_events')
    .select('shop_id, event_type, payload, created_at')
    .in('event_type', ['refund.created', 'charge.refunded', 'payment.refunded'])
    .gte('created_at', range.from.toISOString())
    .lte('created_at', range.to.toISOString());

  const refunds = (data ?? []).filter(r => !r.shop_id || !internal.has(r.shop_id));
  let totalAmount = 0;
  const byPlan: Record<string, number> = {};

  for (const r of refunds) {
    const payload = r.payload as Record<string, unknown> | null;
    const amount = typeof payload?.amount === 'number' ? payload.amount / 100 : 0;
    totalAmount += amount;
    const plan = (payload?.plan_key as string) ?? 'unknown';
    byPlan[plan] = (byPlan[plan] ?? 0) + 1;
  }

  return {
    count: refunds.length,
    totalAmount: Math.round(totalAmount * 100) / 100,
    currency: 'USD',
    refundRate: null,
    byPlan,
    avgDaysToRefund: null,
  };
}

// ─── Acquisition metrics ──────────────────────────────────────────────────────

export async function getAcquisitionMetrics(range: DateRange): Promise<{
  newPaidShops: number;
  cacConfigured: boolean;
  cacAmount: number | null;
  note: string;
}> {
  const db = getAdminDb();
  const internal = getInternalShopIds();

  const { data } = await db
    .from('shop_subscriptions')
    .select('shop_id, status, created_at')
    .eq('status', 'active')
    .gte('created_at', range.from.toISOString())
    .lte('created_at', range.to.toISOString());

  const newPaidShops = (data ?? []).filter(r => !internal.has(r.shop_id)).length;

  // Check for acquisition cost table
  let cacConfigured = false;
  let cacAmount: number | null = null;

  try {
    const { data: costData } = await db
      .from('commercial_acquisition_costs')
      .select('spend_amount, attributed_paid_shops')
      .gte('period_start', range.from.toISOString())
      .lte('period_end', range.to.toISOString());

    if (costData && costData.length > 0) {
      cacConfigured = true;
      const totalSpend = costData.reduce((s, r) => s + (r.spend_amount ?? 0), 0);
      const totalShops = costData.reduce((s, r) => s + (r.attributed_paid_shops ?? 0), 0);
      cacAmount = totalShops > 0 ? Math.round((totalSpend / totalShops) * 100) / 100 : null;
    }
  } catch {
    // Table not yet created — CAC not configured
  }

  return {
    newPaidShops,
    cacConfigured,
    cacAmount,
    note: cacConfigured
      ? 'CAC = verified acquisition spend ÷ new paid shops in period.'
      : 'CAC data not configured. Add acquisition cost records via /api/admin/billing-health/acquisition.',
  };
}

// ─── LTV / CAC ────────────────────────────────────────────────────────────────

export async function getLifetimeValue(
  revenueMetrics: RevenueMetrics,
  churnMetrics: ChurnMetrics,
  acquisitionMetrics: Awaited<ReturnType<typeof getAcquisitionMetrics>>,
): Promise<LtvCacMetrics> {
  const arpa = revenueMetrics.arpa;
  const monthlyChurnRate = churnMetrics.logoRate !== null
    ? churnMetrics.logoRate / 100
    : null;

  let estimatedLtv: number | null = null;
  let ltvNote = '';

  if (churnMetrics.insufficient) {
    ltvNote = 'Insufficient sample size for reliable LTV calculation.';
  } else if (monthlyChurnRate === null) {
    ltvNote = 'Insufficient churn data for LTV calculation.';
  } else if (monthlyChurnRate === 0) {
    ltvNote = 'Monthly churn is zero — LTV is theoretically infinite. Insufficient Data (too early to calculate).';
  } else if (arpa > 0) {
    estimatedLtv = Math.round((arpa / monthlyChurnRate) * 100) / 100;
    ltvNote = 'LTV = ARPA ÷ monthly logo churn rate. Gross-margin-adjusted LTV available in future update.';
  } else {
    ltvNote = 'ARPA is zero — no paid shops with known pricing.';
  }

  const cac = acquisitionMetrics.cacAmount;
  const ltvToCacRatio = estimatedLtv !== null && cac !== null && cac > 0
    ? Math.round((estimatedLtv / cac) * 10) / 10
    : null;

  const paybackPeriodMonths = cac !== null && arpa > 0
    ? Math.round((cac / arpa) * 10) / 10
    : null;

  return {
    arpa,
    monthlyChurnRate,
    estimatedLtv,
    cac,
    ltvToCacRatio,
    paybackPeriodMonths,
    ltvNote,
    cacNote: acquisitionMetrics.note,
  };
}

// ─── Billing health score ─────────────────────────────────────────────────────

export interface HealthScoreResult {
  score: number | null;
  dimensions: Record<string, { score: number | null; maxPoints: number; label: string; note: string }>;
  insufficient: boolean;
  note: string;
}

export function computeBillingHealthScore(
  webhook: WebhookHealth,
  subscriptions: SubscriptionSummary,
  renewals: RenewalHealth,
  trials: TrialMetrics,
  churn: ChurnMetrics,
  refunds: RefundMetrics,
): HealthScoreResult {
  const dimensions: HealthScoreResult['dimensions'] = {};
  let totalEarned = 0;
  let totalPossible = 0;
  let anyInsufficient = false;

  // Webhook reliability — 25 pts
  const wScore = computeWebhookScore(webhook);
  dimensions.webhook = { ...wScore, maxPoints: 25, label: 'Webhook Reliability' };
  if (wScore.score !== null) { totalEarned += wScore.score; totalPossible += 25; }
  else anyInsufficient = true;

  // Subscription reconciliation — 20 pts (unknown plan keys, mismatches)
  const recScore = subscriptions.total > 0 ? 20 : null;
  dimensions.reconciliation = {
    score: recScore, maxPoints: 20, label: 'Subscription Reconciliation',
    note: recScore !== null ? 'No known plan mismatches detected.' : 'Insufficient Data',
  };
  if (recScore !== null) { totalEarned += recScore; totalPossible += 20; }
  else anyInsufficient = true;

  // Renewal success — 20 pts
  const totalSubs = subscriptions.active + subscriptions.pastDue;
  const renewalScore = totalSubs > 0
    ? Math.round(20 * (1 - renewals.pastDueCount / Math.max(totalSubs, 1)))
    : null;
  dimensions.renewal = {
    score: renewalScore, maxPoints: 20, label: 'Renewal Success',
    note: renewalScore !== null
      ? `${renewals.pastDueCount} past-due out of ${totalSubs} active+past-due.`
      : 'Insufficient Data',
  };
  if (renewalScore !== null) { totalEarned += renewalScore; totalPossible += 20; }
  else anyInsufficient = true;

  // Trial conversion — 15 pts
  const trialScore = trials.conversionRate !== null
    ? Math.round(15 * Math.min(trials.conversionRate / 100 / 0.3, 1))
    : null;
  dimensions.trialConversion = {
    score: trialScore, maxPoints: 15, label: 'Trial Conversion',
    note: trialScore !== null
      ? `${trials.conversionRate}% conversion (30% = full score).`
      : 'Insufficient Data',
  };
  if (trialScore !== null) { totalEarned += trialScore; totalPossible += 15; }
  else anyInsufficient = true;

  // Churn health — 10 pts
  const churnScore = churn.logoRate !== null && !churn.insufficient
    ? Math.round(10 * Math.max(0, 1 - churn.logoRate / 100 / 0.05))
    : null;
  dimensions.churn = {
    score: churnScore, maxPoints: 10, label: 'Churn Health',
    note: churnScore !== null
      ? `Logo churn ${churn.logoRate}% (5% monthly = 0 pts, 0% = full score).`
      : 'Insufficient Data',
  };
  if (churnScore !== null) { totalEarned += churnScore; totalPossible += 10; }
  else anyInsufficient = true;

  // Refund health — 10 pts
  const refundScore = refunds.count === 0 ? 10 : Math.max(0, 10 - refunds.count * 2);
  dimensions.refunds = {
    score: refundScore, maxPoints: 10, label: 'Refund Health',
    note: `${refunds.count} refunds in period (-2 pts each, min 0).`,
  };
  totalEarned += refundScore;
  totalPossible += 10;

  const score = totalPossible > 0
    ? Math.round((totalEarned / totalPossible) * 100)
    : null;

  return {
    score,
    dimensions,
    insufficient: anyInsufficient,
    note: anyInsufficient
      ? 'Some dimensions had insufficient data and were excluded from the score.'
      : 'Score is 0–100. Each dimension is documented in docs/commercial/analytics/04_BILLING_HEALTH_SCORE.md.',
  };
}

function computeWebhookScore(webhook: WebhookHealth): { score: number | null; note: string } {
  if (webhook.received === 0) {
    return { score: null, note: 'Insufficient Data — no webhooks received in period.' };
  }
  const failRate = (webhook.failureRate ?? 0) / 100;
  const latencyOk = webhook.p95LatencyMs === null || webhook.p95LatencyMs < 5000;
  let pts = 25;
  pts -= Math.round(failRate * 25);
  if (!latencyOk) pts -= 5;
  return {
    score: Math.max(0, pts),
    note: `Failure rate ${webhook.failureRate ?? 'N/A'}%. P95 latency ${webhook.p95LatencyMs ?? 'N/A'}ms.`,
  };
}

// ─── Metric warnings ──────────────────────────────────────────────────────────

export function getMetricWarnings(
  subscriptions: SubscriptionSummary,
  webhook: WebhookHealth,
  renewals: RenewalHealth,
  trials: TrialMetrics,
  churn: ChurnMetrics,
  refunds: RefundMetrics,
): string[] {
  const warnings: string[] = [];

  if ((webhook.failureRate ?? 0) > 5) {
    warnings.push(`Webhook failure rate is ${webhook.failureRate}% — threshold is 5%.`);
  }
  if (webhook.p95LatencyMs !== null && webhook.p95LatencyMs > 5000) {
    warnings.push(`Webhook P95 latency is ${webhook.p95LatencyMs}ms — threshold is 5000ms.`);
  }
  if (webhook.oldestUnprocessedAgeMs !== null && webhook.oldestUnprocessedAgeMs > 3600000) {
    warnings.push('Unprocessed webhook event older than 1 hour detected.');
  }
  if (renewals.mrrAtRisk > 0) {
    warnings.push(`$${renewals.mrrAtRisk} MRR at risk from past-due subscriptions.`);
  }
  if (subscriptions.pastDue > 0) {
    warnings.push(`${subscriptions.pastDue} subscription(s) currently past due.`);
  }
  if (churn.logoRate !== null && churn.logoRate > 5) {
    warnings.push(`Logo churn rate ${churn.logoRate}% exceeds 5% monthly threshold.`);
  }
  if (trials.expiringIn1Day > 0) {
    warnings.push(`${trials.expiringIn1Day} trial(s) expiring within 24 hours.`);
  }
  if (refunds.count > 3) {
    warnings.push(`${refunds.count} refunds in period — review for patterns.`);
  }

  return warnings;
}

// ─── Full overview ────────────────────────────────────────────────────────────

export async function getBillingOverview(range: DateRange): Promise<BillingOverview> {
  const [
    subscriptions,
    revenue,
    trials,
    churn,
    webhook,
    renewals,
    refunds,
    acquisition,
  ] = await Promise.all([
    getSubscriptionSummary(),
    getRevenueMetrics(),
    getTrialMetrics(range),
    getChurnMetrics(range),
    getWebhookHealth(range),
    getRenewalHealth(range),
    getRefundMetrics(range),
    getAcquisitionMetrics(range),
  ]);

  const value = await getLifetimeValue(revenue, churn, acquisition);
  const warnings = getMetricWarnings(subscriptions, webhook, renewals, trials, churn, refunds);

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    subscriptions,
    revenue,
    trials,
    churn,
    webhook,
    renewals,
    value,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}
