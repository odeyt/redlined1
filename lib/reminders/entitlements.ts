/**
 * What a shop's plan allows for internal reminders, and how to say no.
 *
 * The database is the enforcement: the shop_reminders_guard trigger in
 * supabase/migrations/2026-09-29_internal_reminders.sql refuses anything past
 * the plan, and reminder_plan_tier() there is the same rule as reminderTier()
 * here. This copy exists so the UI can explain a limit BEFORE somebody fills
 * in a form, and turn the trigger's machine-readable refusal into a sentence.
 *
 * Both are run against tests/db/reminders/planTierScenarios.json — this one
 * by Jest, the SQL one by tests/db/run-reminders-db-tests.mjs — so a change to
 * either that the other does not share fails a test instead of drifting.
 *
 * Plan identity is the canonical one: the owner's `plan` and `trial_ends_at`,
 * through getPlanStatus() in lib/planGate.ts. No shop is special-cased — the
 * same as the existing free-tier trigger — and nothing here knows which payment
 * provider sold the plan.
 */
import { PLANS, FREE_FOREVER_REMINDERS } from '@/config/plans';
import { getPlanStatus } from '@/lib/planGate';
import type { RedlinedPlanId } from '@/lib/payments/types';

/** team: anyone, unlimited. solo: yourself, unlimited. free: yourself, capped. */
export type ReminderTier = 'team' | 'solo' | 'free';

function planGrantsTeam(plan: string): boolean {
  // 'pro' is the legacy generic paid value: getPlanStatus treats it as paid
  // and it predates the tier ladder, so it keeps everything.
  if (plan === 'pro') return true;
  const config = PLANS[plan as RedlinedPlanId];
  return !!config && config.features.teamReminders;
}

/**
 * The tier for one owner's plan.
 *
 * getPlanStatus decides paid / trial / free, paid first — so a stale trial
 * date cannot promote a Solo subscriber, and an unsettled NULL plan is free.
 * Among paid plans, the registry's teamReminders feature splits Solo from the
 * rest.
 */
export function reminderTier(plan: string | null, trialEndsAt: string | null): ReminderTier {
  const status = getPlanStatus(plan, trialEndsAt);
  if (status === 'pro') return planGrantsTeam(plan as string) ? 'team' : 'solo';
  if (status === 'trial') return 'team';
  return 'free';
}

const RANK: Record<ReminderTier, number> = { free: 0, solo: 1, team: 2 };

/**
 * The shop's tier from all of its owners: the most generous wins, so the
 * answer never depends on row order.
 *
 * Each entry is one owner membership; `null` is an owner with no profile row.
 * Entitlement that cannot be proven is not granted: no owners, owners without
 * profiles, or NULL/unknown plans all read as 'free' — never team assignment,
 * never unlimited. Same rule as reminder_plan_tier() in SQL.
 */
export function reminderTierForOwners(
  owners: readonly ({ plan: string | null; trialEndsAt: string | null } | null)[],
): ReminderTier {
  return owners
    .filter((o): o is { plan: string | null; trialEndsAt: string | null } => o !== null)
    .map(o => reminderTier(o.plan, o.trialEndsAt))
    .reduce((best, t) => (RANK[t] > RANK[best] ? t : best), 'free' as ReminderTier);
}

export interface ReminderEntitlements {
  tier: ReminderTier;
  /** Null means no cap. */
  maxOpen: number | null;
  canAssignToOthers: boolean;
}

export function reminderEntitlements(tier: ReminderTier): ReminderEntitlements {
  if (tier === 'free') {
    return { tier, maxOpen: FREE_FOREVER_REMINDERS.maxOpen, canAssignToOthers: FREE_FOREVER_REMINDERS.teamReminders };
  }
  return { tier, maxOpen: null, canAssignToOthers: tier === 'team' };
}

/** Plans whose features include team assignment — named in the upgrade prompt. */
export function plansWithTeamReminders(): string[] {
  return Object.values(PLANS).filter(p => p.features.teamReminders).map(p => p.name);
}

// ── Turning the database's refusals into sentences ─────────────────────────

export type ReminderRefusal =
  | { kind: 'limit'; limit: number }
  | { kind: 'team_plan' }
  | { kind: 'assign_forbidden' }
  | { kind: 'assignee_invalid' }
  | { kind: 'link_invalid'; entity: 'customer' | 'vehicle' | 'job_card' }
  | { kind: 'immutable' }
  | { kind: 'not_open' }
  | { kind: 'disabled' };

/**
 * Reads the trigger's error code out of a Supabase/Postgres error. Returns
 * null for anything else, so a genuine failure is never dressed up as a plan
 * limit.
 */
export function parseReminderRefusal(error: unknown): ReminderRefusal | null {
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message !== 'string') return null;

  const limit = /REMINDER_LIMIT:(\d+)/.exec(message);
  if (limit) return { kind: 'limit', limit: Number(limit[1]) };

  const link = /REMINDER_LINK_INVALID:(customer|vehicle|job_card)/.exec(message);
  if (link) return { kind: 'link_invalid', entity: link[1] as 'customer' | 'vehicle' | 'job_card' };

  if (message.includes('REMINDER_TEAM_PLAN')) return { kind: 'team_plan' };
  if (message.includes('REMINDER_ASSIGN_FORBIDDEN')) return { kind: 'assign_forbidden' };
  if (message.includes('REMINDER_ASSIGNEE_INVALID')) return { kind: 'assignee_invalid' };
  if (message.includes('REMINDER_IMMUTABLE')) return { kind: 'immutable' };
  if (message.includes('REMINDER_NEW_MUST_BE_OPEN')) return { kind: 'not_open' };
  if (message.includes('REMINDERS_DISABLED')) return { kind: 'disabled' };
  return null;
}

const LINK_LABEL = { customer: 'customer', vehicle: 'vehicle', job_card: 'job card' } as const;

/** Whether this refusal is one an upgrade would fix — the only time to offer one. */
export function isUpgradeRefusal(refusal: ReminderRefusal | null): boolean {
  return refusal?.kind === 'limit' || refusal?.kind === 'team_plan';
}

export function reminderRefusalMessage(refusal: ReminderRefusal): string {
  switch (refusal.kind) {
    case 'limit':
      return `Free Forever keeps up to ${refusal.limit} open reminders at a time. `
        + 'Complete one to make room, or upgrade in Settings → Subscriptions for unlimited reminders.';
    case 'team_plan':
      return 'Assigning reminders to other team members needs '
        + plansWithTeamReminders()[0] + ' or above. You can still assign reminders to yourself. '
        + 'Upgrade in Settings → Subscriptions.';
    case 'assign_forbidden':
      return 'Only an owner or manager can assign a reminder to someone else.';
    case 'assignee_invalid':
      return 'That person is not a member of this shop, so the reminder cannot be assigned to them.';
    case 'link_invalid':
      // Same sentence whether the record is missing or belongs elsewhere, so
      // it reveals nothing about another shop.
      return `That ${LINK_LABEL[refusal.entity]} is not in the location you are working in. `
        + 'If it belongs to another location, switch to that location first.';
    case 'disabled':
      return 'Reminders are turned off for this shop.';
    case 'immutable':
      return 'A reminder cannot be moved to another shop or change who created it.';
    case 'not_open':
      return 'A new reminder always starts open.';
  }
}
