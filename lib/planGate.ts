export type PlanStatus = 'trial' | 'free' | 'pro';

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
  // Internal tooling — never plan-locked
  'system-health',
  'disaster-recovery',
  'testing-dashboard',
]);

export function canAccess(moduleId: string, status: PlanStatus): boolean {
  if (status === 'pro' || status === 'trial') return true;
  return FREE_MODULES.has(moduleId);
}

export function needsWatermark(status: PlanStatus): boolean {
  return status === 'free';
}
