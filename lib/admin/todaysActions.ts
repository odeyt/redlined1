/**
 * lib/admin/todaysActions.ts
 * Pure. Turns figures the owner portal already computes into a short, ordered
 * list of "what needs a human today", each with a count and a link to a filtered
 * view that already exists. Nothing here reads data, guesses, or acts.
 *
 * Every item is derived from a documented predicate elsewhere:
 *   - activation counts        → lib/admin/activationRules.ts
 *   - billing states           → lib/admin/accountStatus.ts
 *   - overdue / new leads      → lib/admin/supportTriage.ts
 *   - profiles with no member  → lib/admin/profileDiagnostics.ts
 *
 * A source that could not be read produces an explicit "unavailable" entry, never
 * a zero. "Checkout started" is not recorded anywhere, so it is listed as not
 * derivable instead of being approximated.
 */
import type { OwnerOverview } from '@/lib/admin/accountsData';
import { SUPPORT_OVERDUE_DAYS, type SupportSummary } from '@/lib/admin/supportTriage';
import type { ProfileDiagnosticsSummary } from '@/lib/admin/profileDiagnostics';

export interface TodayAction {
  id: string;
  label: string;
  count: number;
  detail: string;
  /** A view that already exists, or null when there is nothing to link to. */
  href: string | null;
  /**
   * exact    the page lists exactly the accounts or records counted here
   * broader  the page lists a wider set that contains them (no filter reproduces the count)
   * api      a read-only JSON endpoint, not a page
   */
  linkKind: 'exact' | 'broader' | 'api';
  /** Lower sorts first. */
  priority: number;
  /** Money or access is at stake, or a customer is waiting. */
  urgent: boolean;
}

export interface TodayUnavailable {
  id: string;
  label: string;
  reason: string;
}

export interface TodaysActions {
  actions: TodayAction[];
  /** Sources that could not be read; shown so a missing action is never mistaken for "all clear". */
  unavailable: TodayUnavailable[];
  /** What cannot be shown because nothing records it. */
  notDerivable: string[];
  allClear: boolean;
}

export const TODAYS_ACTIONS_NOT_DERIVABLE = ['Checkout started (not recorded anywhere)', 'Upgrade page viewed (not recorded anywhere)'];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The support summary to hand to buildTodaysActions. A queue whose ticket source could not be read has
 * a summary of zeros, which is indistinguishable from "nothing waiting": it becomes null so the panel
 * says "unavailable" instead of "nothing needs attention".
 */
export function supportSummaryForToday(
  result: { sources: { supportTickets: 'available' | 'unavailable' }; summary: SupportSummary },
): SupportSummary | null {
  return result.sources.supportTickets === 'available' ? result.summary : null;
}

export function buildTodaysActions(input: {
  overview: OwnerOverview;
  /** null = the support queue could not be read. */
  support: SupportSummary | null;
  /** null = diagnostics were not computed. */
  diagnostics: ProfileDiagnosticsSummary | null;
}): TodaysActions {
  const { overview, support, diagnostics } = input;
  const actions: TodayAction[] = [];
  const unavailable: TodayUnavailable[] = [];
  const add = (a: TodayAction) => { if (a.count > 0) actions.push(a); };

  // Billing states that put revenue or access in question — always first.
  add({
    id: 'billing-mismatch', label: 'Billing records contradict each other', count: overview.active.billingMismatch,
    detail: 'Excluded from revenue until reviewed. Open the shop, compare plan, subscription and events, then correct at the source.',
    href: '/admin/accounts?status=billing_mismatch&archived=active', linkKind: 'exact', priority: 10, urgent: true,
  });
  add({
    id: 'past-due', label: 'Payments past due', count: overview.active.pastDue,
    detail: 'Subscription is past due. Counted as revenue at risk.',
    href: '/admin/accounts?status=past_due&archived=active', linkKind: 'exact', priority: 20, urgent: true,
  });
  add({
    id: 'paid-unverified', label: 'Paid access with no confirming billing record', count: overview.active.paidUnverified,
    detail: 'A paid plan the billing record does not confirm. Not counted as revenue. The data does not say whether it is a customer or a manual grant.',
    href: '/admin/accounts?status=paid_unverified&archived=active', linkKind: 'exact', priority: 30, urgent: true,
  });
  add({
    id: 'cancel-scheduled', label: 'Subscriptions set to cancel', count: overview.active.cancelScheduled,
    detail: 'Still paying this period, cancelling at period end. A retention conversation is still possible.',
    href: '/admin/accounts?status=cancel_scheduled&archived=active', linkKind: 'exact', priority: 40, urgent: false,
  });

  // Customers waiting on us.
  if (support) {
    add({
      id: 'overdue-tickets', label: 'Overdue support tickets', count: support.overdueTickets,
      detail: `Open and waiting on us for at least ${SUPPORT_OVERDUE_DAYS} days, counted from the first unanswered customer message${support.oldestOpenTicketAgeDays != null ? ` (oldest open ticket: ${plural(support.oldestOpenTicketAgeDays, 'day')} old)` : ''}. Confirmed test/spam excluded.`,
      href: '/admin/support?view=overdue', linkKind: 'exact', priority: 15, urgent: true,
    });
    add({
      id: 'unreviewed-tickets', label: 'Open tickets nobody has classified', count: support.unreviewedOpenTickets,
      detail: 'Not yet marked real, test or spam. Left counted as open until someone decides. The link lists all open records, including ones already classified.',
      href: '/admin/support?view=open', linkKind: 'broader', priority: 50, urgent: false,
    });
    add({
      id: 'new-leads', label: 'New shop-audit leads', count: support.newLeads,
      detail: 'Leads with status "new". These are enquiries, not tickets. The link lists every lead, not only new ones.',
      href: '/admin/support?view=leads', linkKind: 'broader', priority: 60, urgent: false,
    });
  } else {
    unavailable.push({ id: 'support', label: 'Support queue', reason: 'The support queue could not be read, so ticket and lead actions are not shown.' });
  }

  // Activation.
  const act = overview.activation;
  if (act.available) {
    add({
      id: 'new-shops-onboarding', label: 'New shops that have not started', count: act.newShopsNeedingOnboarding,
      detail: 'Signed up in the last 14 days with no business name and no customer, vehicle, job, estimate, invoice or technician yet. No filter reproduces this set: the link lists every active Free-plan shop.',
      href: '/admin/accounts?status=free&archived=active', linkKind: 'broader', priority: 70, urgent: false,
    });
    add({
      id: 'partial-onboarding', label: 'Onboarding started, not activated', count: act.partialOnboarding,
      detail: 'Some setup or data exists but not enough to meet the activation definition. No filter reproduces this set: the link lists every active shop.',
      href: '/admin/accounts?archived=active', linkKind: 'broader', priority: 80, urgent: false,
    });
    add({
      id: 'approaching-free-limit', label: 'Shops approaching a Free plan limit', count: act.approachingFreeLimit,
      detail: 'At 80% or more of the free customer, vehicle or monthly job limit — the natural moment to talk about upgrading. No filter reproduces this set: the link lists every active Free-plan shop.',
      href: '/admin/accounts?status=free&archived=active', linkKind: 'broader', priority: 65, urgent: false,
    });
    add({
      id: 'activated-not-paid', label: 'Activated shops not yet paying', count: act.activatedNotPaid,
      detail: 'Using the product for real work without a verified subscription. Your best conversion candidates. No filter reproduces this set: the link lists every active shop.',
      href: '/admin/accounts?archived=active', linkKind: 'broader', priority: 75, urgent: false,
    });
    if (act.activationUnknown > 0) {
      unavailable.push({ id: 'activation-unknown', label: 'Activation (partly unknown)', reason: `${plural(act.activationUnknown, 'shop')} could not be classified because some data was unreadable. They are not counted above.` });
    }
  } else {
    unavailable.push({ id: 'activation', label: 'Activation', reason: act.reason ?? 'Activation could not be computed, so onboarding actions are not shown.' });
  }

  // Unlinked logins.
  if (diagnostics?.available) {
    add({
      id: 'profiles-without-membership', label: 'Logins with no shop membership', count: diagnostics.profilesWithoutMembership,
      detail: 'Read-only diagnosis available from the profile-diagnostics API. Nothing is linked or removed automatically.',
      href: '/api/admin/profile-diagnostics', linkKind: 'api', priority: 90, urgent: false,
    });
  } else if (diagnostics) {
    unavailable.push({ id: 'profile-diagnostics', label: 'Profile diagnostics', reason: diagnostics.reason ?? 'Unavailable.' });
  }

  actions.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  return {
    actions, unavailable, notDerivable: TODAYS_ACTIONS_NOT_DERIVABLE,
    allClear: actions.length === 0 && unavailable.length === 0,
  };
}
