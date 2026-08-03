export type PlanStatus = 'trial' | 'free' | 'pro';

/**
 * Length of the evaluation period granted to a new account.
 *
 * Lives here rather than in ShopProvisioningService because the signup page
 * quotes it to customers, and that is a client component: importing it from
 * the provisioning service would pull getAdminDb — and the service-role key —
 * into the browser bundle. This module is client-safe by design.
 */
export const TRIAL_DAYS = 7;

const PAID_PLANS = new Set(['pro', 'solo', 'starter', 'professional', 'business', 'enterprise']);

export function getPlanStatus(plan: string | null, trialEndsAt: string | null): PlanStatus {
  if (plan && PAID_PLANS.has(plan)) return 'pro';
  if ((plan === 'trial' || plan == null) && trialEndsAt && new Date(trialEndsAt) > new Date()) return 'trial';
  return 'free';
}

export function trialDaysLeft(trialEndsAt: string | null): number {
  if (!trialEndsAt) return 0;
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000));
}

// Free Forever plan modules — permanent, not a post-trial downgrade. Matches
// the feature set promised on the pricing page (customers/vehicles, job
// cards, inspections, estimates, invoices); volume caps (job count, etc.)
// are enforced separately, not by module gating.
const FREE_MODULES = new Set([
  // Core operations
  'dashboard',
  // AppShell sends every owner and manager to Command Center on load — it is
  // the designated home, not a premium extra. Omitting it meant a free owner
  // was redirected there and immediately bounced back to the legacy dashboard,
  // so the free plan's landing experience was a module it could not open.
  // The free dashboard already rendered the Command Center panel inline, so
  // the feature was visible while its page stayed locked.
  'command-center',
  'customers',
  'vehicles',
  'job-cards',
  'inspections',
  'estimates',
  'repair-orders',
  'invoices',
  'scheduling',
  'appointments',
  // Utilities (usage limits enforced server-side)
  'vin',
  'dtc',
  // Account management
  'settings',
  'subscriptions',
]);

/**
 * Modules belonging to whoever runs the platform, not to any shop: Playwright
 * regression results, backup and restore, platform infrastructure health.
 *
 * These used to sit in FREE_MODULES as "internal tooling — never plan-locked".
 * That was true but named the wrong axis, and implied any free shop could
 * reach them. The real question is not which plan a shop is on; it is whether
 * the viewer runs the platform at all.
 *
 * Plan gating therefore does not apply — canAccess() returns true for them —
 * and visibility is decided by isPlatformOwner in Sidebar, with their APIs
 * refusing everyone else regardless. Excluding them from plan gating outright
 * also means a platform owner whose own plan reads as lapsed is never bounced
 * out of the tools they need to diagnose exactly that.
 */
export const PLATFORM_MODULES = new Set([
  'system-health',
  'disaster-recovery',
  'testing-dashboard',
]);

export function canAccess(moduleId: string, status: PlanStatus): boolean {
  // Plan is not the axis for platform tooling — see PLATFORM_MODULES.
  if (PLATFORM_MODULES.has(moduleId)) return true;
  if (status === 'pro' || status === 'trial') return true;
  return FREE_MODULES.has(moduleId);
}

export function needsWatermark(status: PlanStatus): boolean {
  return status === 'free';
}
