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

// Modules accessible on the Free Forever plan.
// Core operational modules are open (with usage limits enforced server-side).
// Premium analytics / AI / team features remain locked until upgrade.
const FREE_MODULES = new Set([
  // Core operations — free users can manage their data
  'dashboard',
  'customers',
  'vehicles',
  'estimates',
  'repair-orders',
  'invoices',
  'job-cards',
  'scheduling',
  'appointments',
  'digital-inspections',
  'ai-advisor',        // limited to 2/mo — usage enforced server-side
  'vin-decoder',       // limited to 2/mo — usage enforced server-side

  // Account management — always accessible
  'settings',
  'subscriptions',

  // Internal tooling — never plan-locked
  'system-health',
  'disaster-recovery',
  'testing-dashboard',
]);

// Premium-only modules (not in FREE_MODULES):
//   command-center, reports, repair-intelligence, triage,
//   communication, time-tracking, labor-guide, parts, diagnostics, technicians

export function canAccess(moduleId: string, status: PlanStatus): boolean {
  if (status === 'pro' || status === 'trial') return true;
  return FREE_MODULES.has(moduleId);
}

export function needsWatermark(status: PlanStatus): boolean {
  return status === 'free';
}
