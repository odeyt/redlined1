/**
 * Detects the Free Forever usage-limit signal raised by the database
 * triggers in supabase/migrations/free_tier_usage_limits.sql
 * (RAISE EXCEPTION 'FREE_TIER_LIMIT:<table>:<limit>'). Those triggers are
 * the actual enforcement — this only turns the resulting Postgres error
 * into a friendly, actionable message for the UI.
 */

export interface FreeTierLimitInfo {
  resource: 'customers' | 'vehicles' | 'job_cards';
  limit: number;
}

const RESOURCE_LABELS: Record<FreeTierLimitInfo['resource'], string> = {
  customers: 'customers',
  vehicles: 'vehicles',
  job_cards: 'jobs this month',
};

export function parseFreeTierLimitError(error: unknown): FreeTierLimitInfo | null {
  const message = (error as { message?: string } | null)?.message ?? '';
  const match = /FREE_TIER_LIMIT:(customers|vehicles|job_cards):(\d+)/.exec(message);
  if (!match) return null;
  return { resource: match[1] as FreeTierLimitInfo['resource'], limit: Number(match[2]) };
}

export function freeTierLimitMessage(info: FreeTierLimitInfo): string {
  const label = RESOURCE_LABELS[info.resource];
  return `Free Forever is limited to ${info.limit} ${label}. Upgrade your plan in Settings → Subscriptions to add more.`;
}
