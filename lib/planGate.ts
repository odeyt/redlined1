export type PlanStatus = 'trial' | 'free' | 'pro';

export function getPlanStatus(plan: string | null, trialEndsAt: string | null): PlanStatus {
  if (plan === 'pro') return 'pro';
  if ((plan === 'trial' || plan == null) && trialEndsAt && new Date(trialEndsAt) > new Date()) return 'trial';
  return 'free';
}

export function trialDaysLeft(trialEndsAt: string | null): number {
  if (!trialEndsAt) return 0;
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000));
}

// Modules available after trial expires — just enough to see the value, not enough to run the shop
const FREE_MODULES = new Set([
  'dashboard',   // can see their data is there, just locked
  'settings',    // must be able to manage their account / upgrade
  'subscriptions', // upgrade path
]);

export function canAccess(moduleId: string, status: PlanStatus): boolean {
  if (status === 'pro' || status === 'trial') return true;
  return FREE_MODULES.has(moduleId);
}

export function needsWatermark(status: PlanStatus): boolean {
  return status === 'free';
}
