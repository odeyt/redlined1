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

/**
 * What a shop is entitled to, from the two fields that record it.
 *
 * An unexpired trial date means a trial, whatever the `plan` column says.
 *
 * That tolerance is the point. Previously the trial only counted when `plan`
 * was 'trial' or null, so the row a signup trigger writes — plan 'free' with a
 * future trial date — read as an ordinary free account. New customers silently
 * lost Vehicle Intake, Parts, Reports, Employees and AI Copilot, while accounts
 * created before the trigger changed kept them. It took three attempts to fix
 * because every attempt added another place that had to run a repair first:
 * the auth callback (which password sign-in never reaches), /api/provision
 * (only called when a user has no shop), then usePlan.
 *
 * Reading the fields honestly removes the need for any of that. A row that has
 * not been settled yet still produces the right answer, so no ordering, no
 * repair path and no migration can leave a customer short of what they were
 * promised. ensureInitialPlan still normalises the columns, but nothing now
 * depends on it having run.
 *
 * The date is what expires. When it passes, the shop is free — which is also
 * what makes "no second trial" hold: a spent trial has a null date, and a null
 * date is never a trial.
 *
 * Paid plans are checked first, so a stale trial date on a subscriber's row
 * cannot demote them.
 */
export function getPlanStatus(plan: string | null, trialEndsAt: string | null): PlanStatus {
  if (plan && PAID_PLANS.has(plan)) return 'pro';
  if (trialEndsAt && new Date(trialEndsAt) > new Date()) return 'trial';
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
  // AI Copilot. Its own subtitle reads "Internal AI testing console — select a
  // task, review the context, and run": it asks a shop owner to hand-edit a
  // JSON blob pre-filled with a fictional 2019 Camry, and returns raw model
  // output. A developer tool that shipped to customers.
  //
  // Hidden on 2026-08-03 rather than removed, because it is genuinely useful
  // for exercising prompts.
  //
  // Customers lose nothing: the AI they were sold is woven into the workflows
  // where it has context — DTC Lookup (explainDtc) and Inspections
  // (draftEstimateFromInspection). Those are what "AI Advisor" on the
  // Professional and Business cards refers to, and both are untouched.
  //
  // Reverse this once the page reads the shop's own vehicles and jobs instead
  // of asking for JSON.
  'ai',
  // Operator support inbox — customer threads and bug reports across every
  // shop. Reads with service_role, so it must never be reachable by a
  // customer: this entry is what keeps it out of their sidebar, and
  // verifyPlatformOwner on /api/support/inbox is what actually enforces it.
  'support-inbox',
]);

/**
 * Platform modules for which plan gating is meaningless.
 *
 * A subset of PLATFORM_MODULES, not the whole of it. These three report on the
 * platform's own infrastructure, so a plan cannot sensibly withhold them — and
 * exempting them means a platform owner whose own plan reads as lapsed is never
 * locked out of the tools for diagnosing exactly that.
 *
 * AI Copilot is deliberately absent. It is hidden from customers because it is
 * a developer console, but it remains a customer-tier feature underneath, and
 * blanket-exempting it would have quietly handed the free tier a paid module.
 */
const PLAN_EXEMPT_MODULES = new Set([
  'system-health',
  'disaster-recovery',
  'testing-dashboard',
]);

export function canAccess(moduleId: string, status: PlanStatus): boolean {
  // Plan is not the axis for infrastructure tooling — see PLAN_EXEMPT_MODULES.
  if (PLAN_EXEMPT_MODULES.has(moduleId)) return true;
  if (status === 'pro' || status === 'trial') return true;
  return FREE_MODULES.has(moduleId);
}

export function needsWatermark(status: PlanStatus): boolean {
  return status === 'free';
}

/**
 * Technician-seat cap per paid tier, from the pricing page (Solo: 1,
 * Starter: 3, Professional: 8; Business/Enterprise and the generic legacy
 * 'pro' value: unlimited, returned as null).
 *
 * Separate from PlanStatus deliberately: getPlanStatus() collapses every
 * paid tier to 'pro', which loses exactly the distinction a seat cap needs
 * (Solo's 1 seat vs Business's unlimited). This reads the raw `plan` column
 * instead. An active trial with no paid tier chosen yet returns null
 * (unlimited) — trials are time-boxed anyway, and blocking a shop from
 * trying the team-invite feature they're evaluating defeats the trial's
 * purpose.
 */
const SEAT_LIMITS: Record<string, number> = {
  free: 1,
  solo: 1,
  starter: 3,
  professional: 8,
};

export function seatLimitFor(plan: string | null, trialEndsAt: string | null): number | null {
  if (plan && plan in SEAT_LIMITS) return SEAT_LIMITS[plan];
  if (plan && PAID_PLANS.has(plan)) return null; // business / enterprise / generic 'pro'
  if (trialEndsAt && new Date(trialEndsAt) > new Date()) return null;
  return SEAT_LIMITS.free;
}
