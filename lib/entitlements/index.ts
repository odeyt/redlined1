/**
 * lib/entitlements/index.ts
 *
 * Public API for the Redlined1 Platform Entitlement layer.
 *
 * Import from here in application code — do not import individual engine files.
 */

// Plan Registry
export {
  PLAN_REGISTRY,
  PLAN_ORDER,
  PAID_PLAN_KEYS,
  INTERNAL_SHOP_IDS,
  getPlan,
  getPlanOrFree,
  comparePlans,
  planMeetsOrExceeds,
  minimumPlanForFeature,
  annualSavingsPct,
  type PlanKey,
  type PlanDefinition,
  type PlanUsageLimits,
  type PlanFeatures,
  type BillingMode,
  type BillingInterval,
} from './planRegistry';

// Feature Registry
export {
  FEATURE_REGISTRY,
  MONTHLY_METRIC_KEYS,
  TOTAL_METRIC_KEYS,
  getFeature,
  getFeaturesByCategory,
  type FeatureKey,
  type UsageMetricKey,
  type FeatureDefinition,
  type FeatureCategory,
} from './featureRegistry';

// Entitlement Engine
export {
  getEffectivePlanKey,
  getWorkspaceUsageSnapshot,
  getWorkspaceEntitlements,
  checkFeatureAccess,
  checkUsageAccess,
  assertFeatureAccess,
  assertUsageAccess,
  recordUsage,
  reserveUsage,
  completeReservation,
  releaseReservation,
  EntitlementUnavailableError,
} from './entitlementEngine';

// Upgrade Engine
export {
  buildUpgradeRecommendation,
  recommendPlanForFeature,
} from './upgradeEngine';

// Permission Service
export {
  authorizeWorkspaceAction,
  getWorkspaceMembership,
  getWorkspaceIdForUser,
  canWrite,
  isAdmin,
  type WorkspaceRole,
  type AccessDecision,
  type AccessReasonCode,
} from './permissionService';

// Types
export type {
  EntitlementResult,
  EntitlementReasonCode,
  WorkspaceUsageSnapshot,
  WorkspaceEntitlements,
  UpgradeRecommendation,
  UsageReservation,
} from './types';
