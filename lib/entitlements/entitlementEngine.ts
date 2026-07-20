/**
 * lib/entitlements/entitlementEngine.ts
 *
 * Central Entitlement Engine — the only place in the application that
 * makes subscription-driven feature and usage access decisions.
 *
 * Application modules must NOT check plan names directly.
 * Ask this engine instead:
 *   "Can this workspace perform this action?"
 *   "Does this workspace have this feature?"
 *   "What is the current limit?"
 *
 * Server-side only. Never expose this to the browser.
 */

import { getAdminDb } from '@/lib/supabaseServer';
import {
  PLAN_REGISTRY,
  PAID_PLAN_KEYS,
  INTERNAL_SHOP_IDS,
  getPlanOrFree,
  minimumPlanForFeature,
  comparePlans,
  type PlanKey,
  type PlanDefinition,
} from './planRegistry';
import { FEATURE_REGISTRY, MONTHLY_METRIC_KEYS, type FeatureKey, type UsageMetricKey } from './featureRegistry';
import { logger } from '@/lib/logger';
import type {
  EntitlementResult,
  WorkspaceUsageSnapshot,
  WorkspaceEntitlements,
  UsageReservation,
} from './types';

// ─── Internal constants ───────────────────────────────────────────────────────

const BILLING_ENABLED = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function nextMonthFirst(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
}

function allowed(
  workspaceId: string,
  plan: PlanDefinition,
  code: EntitlementResult['reasonCode'],
  msg: string,
  overrides: Partial<EntitlementResult> = {},
): EntitlementResult {
  return {
    allowed: true,
    workspaceId,
    effectivePlanKey: plan.key,
    limit: null,
    used: null,
    remaining: null,
    resetAt: null,
    reasonCode: code,
    userMessage: msg,
    upgradeRequired: false,
    recommendedPlanKey: null,
    ...overrides,
  };
}

function denied(
  workspaceId: string,
  plan: PlanDefinition,
  code: EntitlementResult['reasonCode'],
  msg: string,
  overrides: Partial<EntitlementResult> = {},
): EntitlementResult {
  return {
    allowed: false,
    workspaceId,
    effectivePlanKey: plan.key,
    limit: null,
    used: null,
    remaining: null,
    resetAt: null,
    reasonCode: code,
    userMessage: msg,
    upgradeRequired: true,
    recommendedPlanKey: null,
    ...overrides,
  };
}

/**
 * Returns a fail-closed result for infrastructure failures.
 * upgradeRequired=false: this is NOT a plan issue; retryable=true: caller may retry.
 * Never misrepresent an infra failure as a plan limit.
 */
function unavailable(
  workspaceId: string,
  context: string,
  overrides: Partial<EntitlementResult> = {},
): EntitlementResult {
  logger.warn('Entitlement check unavailable', { module: 'entitlementEngine', context });
  return {
    allowed: false,
    workspaceId,
    effectivePlanKey: 'free',
    limit: null,
    used: null,
    remaining: null,
    resetAt: null,
    reasonCode: 'ENTITLEMENT_CHECK_UNAVAILABLE',
    userMessage: 'Service temporarily unavailable. Please try again in a moment.',
    upgradeRequired: false,
    recommendedPlanKey: null,
    retryable: true,
    ...overrides,
  };
}

// ─── Effective plan resolution ─────────────────────────────────────────────────

/**
 * Returns the effective plan key for a workspace.
 * Internal D1 shops always get 'enterprise' (full access).
 * Otherwise reads profiles.plan (set by auth callback + webhooks).
 */
/**
 * Returns the effective plan key for a workspace.
 * Internal D1 shops always get 'enterprise' (full access).
 * Throws EntitlementUnavailableError on DB failure — callers must handle it
 * and return unavailable() rather than swallowing the error.
 */
export class EntitlementUnavailableError extends Error {
  readonly context: string;
  constructor(context: string, cause?: unknown) {
    super(`Entitlement check unavailable: ${context}`);
    this.context = context;
    if (cause) this.cause = cause;
  }
}

export async function getEffectivePlanKey(workspaceId: string): Promise<PlanKey> {
  if (INTERNAL_SHOP_IDS.has(workspaceId)) return 'enterprise';

  let data: { profiles?: { plan?: string } } | null;
  try {
    const db = getAdminDb();
    const result = await db
      .from('shop_users')
      .select('profiles:user_id(plan)')
      .eq('shop_id', workspaceId)
      .eq('role', 'owner')
      .maybeSingle();
    if (result.error) {
      throw new EntitlementUnavailableError('getEffectivePlanKey DB error', result.error);
    }
    data = result.data as typeof data;
  } catch (err) {
    if (err instanceof EntitlementUnavailableError) throw err;
    throw new EntitlementUnavailableError('getEffectivePlanKey unexpected error', err);
  }

  const plan = (data as { profiles?: { plan?: string } } | null)?.profiles?.plan;
  if (plan && PLAN_REGISTRY[plan as PlanKey]) return plan as PlanKey;
  // No plan row found = new user; treat as free (not an error)
  return 'free';
}

// ─── Usage snapshot ────────────────────────────────────────────────────────────

/**
 * Returns a single-query snapshot of all usage for the workspace.
 * Total-resource metrics come from the source tables; monthly counters
 * come from usage_monthly.
 */
export async function getWorkspaceUsageSnapshot(
  workspaceId: string,
): Promise<WorkspaceUsageSnapshot> {
  const yearMonth = currentYearMonth();
  const resetAt = nextMonthFirst();
  const db = getAdminDb();

  const [monthlyRes, customersRes, vehiclesRes, usersRes] = await Promise.all([
    db
      .from('usage_monthly')
      .select('metric, count')
      .eq('shop_id', workspaceId)
      .eq('year_month', yearMonth),
    db.from('customers').select('id', { count: 'exact', head: true }).eq('shop_id', workspaceId),
    db.from('vehicles').select('id', { count: 'exact', head: true }).eq('shop_id', workspaceId),
    db.from('shop_users').select('id', { count: 'exact', head: true }).eq('shop_id', workspaceId),
  ]);

  const monthly: Record<string, number> = {};
  for (const row of (monthlyRes.data ?? [])) {
    monthly[row.metric] = row.count;
  }

  return {
    workspaceId,
    yearMonth,
    resetAt,
    customersTotal:   customersRes.count ?? 0,
    vehiclesTotal:    vehiclesRes.count ?? 0,
    usersTotal:       usersRes.count ?? 0,
    techniciansTotal: 0,   // populated on demand if needed
    locationsTotal:   1,   // single-location default; extend when multi-location lands
    storageMb:        0,   // storage enforcement future phase
    completedJobs:    monthly['completed_jobs'] ?? 0,
    aiCases:          monthly['ai_cases'] ?? 0,
    vinLookups:       monthly['vin_lookups'] ?? 0,
    appointments:     monthly['appointments'] ?? 0,
    dvi:              monthly['dvi'] ?? 0,
    sms:              monthly['sms'] ?? 0,
  };
}

function snapshotValue(
  snapshot: WorkspaceUsageSnapshot,
  metricKey: UsageMetricKey,
): number {
  const map: Record<UsageMetricKey, keyof WorkspaceUsageSnapshot> = {
    customers_total:   'customersTotal',
    vehicles_total:    'vehiclesTotal',
    users_total:       'usersTotal',
    technicians_total: 'techniciansTotal',
    locations_total:   'locationsTotal',
    storage_mb:        'storageMb',
    completed_jobs:    'completedJobs',
    ai_cases:          'aiCases',
    vin_lookups:       'vinLookups',
    appointments:      'appointments',
    dvi:               'dvi',
    sms:               'sms',
  };
  return snapshot[map[metricKey]] as number;
}

function planLimit(plan: PlanDefinition, metricKey: UsageMetricKey): number | null {
  const map: Record<UsageMetricKey, keyof PlanDefinition['limits']> = {
    customers_total:   'customersTotal',
    vehicles_total:    'vehiclesTotal',
    users_total:       'usersTotal',
    technicians_total: 'techniciansTotal',
    locations_total:   'locationsTotal',
    storage_mb:        'storageMb',
    completed_jobs:    'completedJobsPerMonth',
    ai_cases:          'aiCasesPerMonth',
    vin_lookups:       'vinLookupsPerMonth',
    appointments:      'appointmentsPerMonth',
    dvi:               'dviPerMonth',
    sms:               'smsPerMonth',
  };
  return plan.limits[map[metricKey]] as number | null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether a workspace can use a boolean feature.
 *
 * Uses FeatureDefinition.planFeatureKey for the authoritative mapping from
 * snake_case FeatureKey to camelCase PlanFeatures key — no unsafe casts.
 *
 * Fails closed (ENTITLEMENT_CHECK_UNAVAILABLE) on DB errors so creation and
 * paid-feature paths cannot succeed when entitlement state is unknown.
 */
export async function checkFeatureAccess(
  workspaceId: string,
  featureKey: FeatureKey,
): Promise<EntitlementResult> {
  if (INTERNAL_SHOP_IDS.has(workspaceId)) {
    logger.info('Entitlement: internal override', { module: 'entitlementEngine', workspaceId, featureKey });
    const plan = getPlanOrFree('enterprise');
    return allowed(workspaceId, plan, 'INTERNAL_OVERRIDE', 'D1 internal shop — full access', { featureKey });
  }

  if (!BILLING_ENABLED) {
    const plan = getPlanOrFree('free');
    return allowed(workspaceId, plan, 'BILLING_DISABLED', 'Billing enforcement is off', { featureKey });
  }

  const featureDef = FEATURE_REGISTRY[featureKey];
  if (!featureDef) {
    // Unknown feature key — fail closed
    return unavailable(workspaceId, `unknown featureKey: ${featureKey}`);
  }

  let planKey: PlanKey;
  try {
    planKey = await getEffectivePlanKey(workspaceId);
  } catch (err) {
    return unavailable(workspaceId, `getEffectivePlanKey failed for ${workspaceId}`, { featureKey });
  }
  const plan = getPlanOrFree(planKey);

  // Features with no planFeatureKey are structurally included (usage-only gating)
  if (featureDef.planFeatureKey === null) {
    return allowed(workspaceId, plan, 'FEATURE_INCLUDED',
      `${featureDef.name} is included on all plans`, { featureKey });
  }

  // Resolve boolean flag using the authoritative typed mapping
  const hasFeature = plan.features[featureDef.planFeatureKey] === true;
  if (hasFeature) {
    return allowed(workspaceId, plan, 'FEATURE_INCLUDED',
      `${featureDef.name} included in ${plan.name}`, { featureKey });
  }

  const recommendedPlanKey = minimumPlanForFeature(featureDef.planFeatureKey) ?? null;
  const recommendedPlan = recommendedPlanKey ? getPlanOrFree(recommendedPlanKey) : null;

  return denied(workspaceId, plan, 'FEATURE_NOT_INCLUDED',
    `${plan.name} does not include ${featureDef.name}. Upgrade to ${recommendedPlan?.name ?? 'a higher plan'}.`,
    { featureKey, recommendedPlanKey },
  );
}

/**
 * Check whether a workspace can consume quantity more units of a usage metric.
 * Does NOT increment the counter — use reserveUsage() for atomic consumption.
 *
 * Fails closed (ENTITLEMENT_CHECK_UNAVAILABLE) on DB errors.
 */
export async function checkUsageAccess(
  workspaceId: string,
  metricKey: UsageMetricKey,
  requestedQuantity = 1,
): Promise<EntitlementResult> {
  if (INTERNAL_SHOP_IDS.has(workspaceId)) {
    const plan = getPlanOrFree('enterprise');
    return allowed(workspaceId, plan, 'INTERNAL_OVERRIDE', 'D1 internal shop — full access', { metricKey });
  }

  if (!BILLING_ENABLED) {
    const plan = getPlanOrFree('free');
    return allowed(workspaceId, plan, 'BILLING_DISABLED', 'Billing enforcement is off', { metricKey });
  }

  let planKey: PlanKey;
  try {
    planKey = await getEffectivePlanKey(workspaceId);
  } catch {
    return unavailable(workspaceId, `getEffectivePlanKey failed for ${workspaceId}`, { metricKey });
  }
  const plan = getPlanOrFree(planKey);
  const limit = planLimit(plan, metricKey);

  // Null limit = unlimited on this plan
  if (limit === null) {
    return allowed(workspaceId, plan, 'LIMIT_AVAILABLE', 'Unlimited on this plan', {
      metricKey, limit: null, used: null, remaining: null,
    });
  }

  // Zero limit on paid plans = feature not available (e.g. sms on solo)
  if (limit === 0 && PAID_PLAN_KEYS.has(plan.key)) {
    return denied(workspaceId, plan, 'FEATURE_NOT_INCLUDED',
      'This feature is not available on your current plan.',
      { metricKey, limit: 0, used: 0, remaining: 0 },
    );
  }

  let snapshot: WorkspaceUsageSnapshot;
  try {
    snapshot = await getWorkspaceUsageSnapshot(workspaceId);
  } catch {
    return unavailable(workspaceId, `getWorkspaceUsageSnapshot failed for ${workspaceId}`, { metricKey });
  }

  const used = snapshotValue(snapshot, metricKey);
  const remaining = Math.max(0, limit - used);

  const isMonthly = MONTHLY_METRIC_KEYS.has(metricKey);
  const resetAt = isMonthly ? snapshot.resetAt : null;

  if (used + requestedQuantity > limit) {
    const nextPlan = findNextPlanWithMoreCapacity(plan.key, metricKey, used + requestedQuantity);
    return denied(workspaceId, plan, 'PLAN_LIMIT_REACHED',
      `You've used ${used} of ${limit} ${isMonthly ? 'this month' : 'total'}.${resetAt ? ` Resets on ${new Date(resetAt).toLocaleDateString()}.` : ''}`,
      { metricKey, limit, used, remaining, resetAt, recommendedPlanKey: nextPlan },
    );
  }

  return allowed(workspaceId, plan, 'LIMIT_AVAILABLE',
    `${remaining} remaining of ${limit}${isMonthly ? '/mo' : ''}`,
    { metricKey, limit, used, remaining, resetAt },
  );
}

/**
 * Assert version — throws if denied. Use in API routes where a 403 is appropriate.
 */
export async function assertUsageAccess(
  workspaceId: string,
  metricKey: UsageMetricKey,
  requestedQuantity = 1,
): Promise<EntitlementResult> {
  const result = await checkUsageAccess(workspaceId, metricKey, requestedQuantity);
  if (!result.allowed) {
    const err = new Error(result.userMessage);
    (err as Error & { entitlement: EntitlementResult }).entitlement = result;
    (err as Error & { statusCode: number }).statusCode = 402;
    throw err;
  }
  return result;
}

export async function assertFeatureAccess(
  workspaceId: string,
  featureKey: FeatureKey,
): Promise<EntitlementResult> {
  const result = await checkFeatureAccess(workspaceId, featureKey);
  if (!result.allowed) {
    const err = new Error(result.userMessage);
    (err as Error & { entitlement: EntitlementResult }).entitlement = result;
    (err as Error & { statusCode: number }).statusCode = 402;
    throw err;
  }
  return result;
}

/**
 * Returns full entitlement bundle for a workspace — features + limits + current usage.
 * Use in billing dashboards and upgrade prompts.
 */
export async function getWorkspaceEntitlements(
  workspaceId: string,
): Promise<WorkspaceEntitlements> {
  let planKey: PlanKey;
  try {
    planKey = INTERNAL_SHOP_IDS.has(workspaceId)
      ? 'enterprise'
      : await getEffectivePlanKey(workspaceId);
  } catch {
    planKey = 'free';
  }

  const plan = getPlanOrFree(planKey);
  let snapshot: WorkspaceUsageSnapshot;
  try {
    snapshot = await getWorkspaceUsageSnapshot(workspaceId);
  } catch {
    // Return entitlements without live usage on DB error
    snapshot = {
      workspaceId, yearMonth: currentYearMonth(), resetAt: nextMonthFirst(),
      customersTotal: 0, vehiclesTotal: 0, usersTotal: 0, techniciansTotal: 0,
      locationsTotal: 1, storageMb: 0,
      completedJobs: 0, aiCases: 0, vinLookups: 0, appointments: 0, dvi: 0, sms: 0,
    };
  }

  const limits: Record<UsageMetricKey, number | null> = {} as Record<UsageMetricKey, number | null>;
  const usageKeys: UsageMetricKey[] = [
    'customers_total', 'vehicles_total', 'users_total', 'technicians_total',
    'locations_total', 'storage_mb', 'completed_jobs', 'ai_cases',
    'vin_lookups', 'appointments', 'dvi', 'sms',
  ];
  for (const k of usageKeys) {
    limits[k] = planLimit(plan, k);
  }

  const usage: Partial<Record<UsageMetricKey, number>> = {
    customers_total:   snapshot.customersTotal,
    vehicles_total:    snapshot.vehiclesTotal,
    users_total:       snapshot.usersTotal,
    technicians_total: snapshot.techniciansTotal,
    locations_total:   snapshot.locationsTotal,
    storage_mb:        snapshot.storageMb,
    completed_jobs:    snapshot.completedJobs,
    ai_cases:          snapshot.aiCases,
    vin_lookups:       snapshot.vinLookups,
    appointments:      snapshot.appointments,
    dvi:               snapshot.dvi,
    sms:               snapshot.sms,
  };

  const features: Record<FeatureKey, boolean> = {} as Record<FeatureKey, boolean>;
  const featureKeys: FeatureKey[] = [
    'customer_management', 'vehicle_management', 'job_management',
    'estimate_management', 'invoice_management', 'unlimited_invoices',
    'calendar', 'digital_vehicle_inspections', 'ai_diagnostics',
    'ai_service_advisor', 'vin_lookup', 'sms_notifications',
    'basic_reports', 'advanced_reports', 'repair_intelligence',
    'smart_intake', 'triage', 'multi_location', 'multi_user',
    'technician_management', 'priority_support',
    'dedicated_account_manager', 'white_label', 'api_access',
  ];
  for (const fk of featureKeys) {
    const planFeatureKey = FEATURE_REGISTRY[fk]?.planFeatureKey;
    // null planFeatureKey = structurally included on all plans
    features[fk] = INTERNAL_SHOP_IDS.has(workspaceId) ||
      planFeatureKey === null ||
      (planFeatureKey !== undefined && plan.features[planFeatureKey] === true);
  }

  return {
    workspaceId,
    effectivePlanKey: planKey,
    isInternal: INTERNAL_SHOP_IDS.has(workspaceId),
    features,
    limits,
    usage,
  };
}

// ─── Usage recording ──────────────────────────────────────────────────────────

/**
 * Atomically increments a monthly usage counter.
 * Idempotent: pass idempotencyKey (e.g. job_id) to prevent double-counting.
 * For total-resource metrics (customers_total etc.) no recording is needed —
 * those are read directly from source tables.
 */
export async function recordUsage(
  workspaceId: string,
  metricKey: UsageMetricKey,
  quantity = 1,
  idempotencyKey?: string,
): Promise<number> {
  if (!MONTHLY_METRIC_KEYS.has(metricKey)) {
    // Total-resource metrics are read from source tables, not stored here
    return 0;
  }

  const yearMonth = currentYearMonth();
  const db = getAdminDb();

  if (idempotencyKey) {
    // Check if this idempotency key was already consumed this month
    const { data: existing } = await db
      .from('usage_monthly')
      .select('idempotency_keys')
      .eq('shop_id', workspaceId)
      .eq('year_month', yearMonth)
      .eq('metric', metricKey)
      .maybeSingle();

    const keys: string[] = (existing as { idempotency_keys?: string[] } | null)?.idempotency_keys ?? [];
    if (keys.includes(idempotencyKey)) return 0;
  }

  try {
    const { data } = await db.rpc('increment_usage_monthly', {
      p_shop_id: workspaceId,
      p_metric: metricKey,
      p_year_month: yearMonth,
    });
    return (data as number) ?? 0;
  } catch {
    return 0;
  }
}

// ─── Atomic usage reservation ─────────────────────────────────────────────────

/**
 * Reserves usage atomically before an action begins.
 *
 * Pattern:
 *   const reservation = await reserveUsage(shopId, 'ai_cases', 1, idempotencyKey);
 *   if (!reservation.allowed) return 402;      // fail closed
 *   try {
 *     await doWork();
 *     await completeReservation(reservation.reservationId);
 *   } catch {
 *     await releaseReservation(reservation.reservationId);
 *     throw;
 *   }
 *
 * Two simultaneous requests at the limit cannot both succeed — the Postgres
 * advisory lock inside reserve_usage() serializes them.
 *
 * Returns null on DB error (fail closed: caller must treat as denied).
 */
export async function reserveUsage(
  workspaceId: string,
  metricKey: UsageMetricKey,
  quantity = 1,
  idempotencyKey: string,
): Promise<(UsageReservation & { allowed: boolean }) | null> {
  if (INTERNAL_SHOP_IDS.has(workspaceId)) {
    // Internal shops: always allow, skip DB reservation
    return {
      reservationId: crypto.randomUUID(),
      workspaceId,
      metricKey,
      quantity,
      idempotencyKey,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      idempotent: false,
      allowed: true,
    };
  }

  if (!BILLING_ENABLED) {
    return {
      reservationId: crypto.randomUUID(),
      workspaceId,
      metricKey,
      quantity,
      idempotencyKey,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      idempotent: false,
      allowed: true,
    };
  }

  try {
    let planKey: PlanKey;
    try {
      planKey = await getEffectivePlanKey(workspaceId);
    } catch {
      return null;
    }
    const plan = getPlanOrFree(planKey);
    const limit = planLimit(plan, metricKey);

    const db = getAdminDb();
    const { data, error } = await db.rpc('reserve_usage', {
      p_shop_id: workspaceId,
      p_metric: metricKey,
      p_quantity: quantity,
      p_limit: limit,
      p_idempotency_key: idempotencyKey,
      p_year_month: currentYearMonth(),
    });

    if (error || !data || !data[0]) return null;

    const row = data[0] as {
      reservation_id: string;
      idempotent: boolean;
      allowed: boolean;
    };

    if (!row.allowed) {
      return {
        reservationId: '',
        workspaceId,
        metricKey,
        quantity,
        idempotencyKey,
        expiresAt: '',
        idempotent: row.idempotent,
        allowed: false,
      };
    }

    return {
      reservationId: row.reservation_id,
      workspaceId,
      metricKey,
      quantity,
      idempotencyKey,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      idempotent: row.idempotent,
      allowed: true,
    };
  } catch {
    return null;
  }
}

/** Marks a reservation complete and increments usage_monthly. Fire-and-forget safe. */
export async function completeReservation(reservationId: string): Promise<void> {
  if (!reservationId) return;
  try {
    const db = getAdminDb();
    await db.rpc('complete_reservation', { p_reservation_id: reservationId });
  } catch {
    logger.warn('completeReservation failed', { module: 'entitlementEngine', reservationId });
  }
}

/** Releases an in-flight reservation (action failed). Fire-and-forget safe. */
export async function releaseReservation(reservationId: string): Promise<void> {
  if (!reservationId) return;
  try {
    const db = getAdminDb();
    await db.rpc('release_reservation', { p_reservation_id: reservationId });
  } catch {
    logger.warn('releaseReservation failed', { module: 'entitlementEngine', reservationId });
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function findNextPlanWithMoreCapacity(
  currentKey: PlanKey,
  metricKey: UsageMetricKey,
  neededQuantity: number,
): PlanKey | null {
  const planOrder: PlanKey[] = ['free', 'solo', 'starter', 'professional', 'business', 'enterprise'];
  for (const key of planOrder) {
    if (comparePlans(key, currentKey) <= 0) continue;
    const plan = PLAN_REGISTRY[key];
    const limit = planLimit(plan, metricKey);
    if (limit === null || limit >= neededQuantity) return key;
  }
  return 'enterprise';
}
