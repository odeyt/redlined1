/**
 * lib/admin/supportTriage.ts
 * Pure support-queue rules for the owner portal: what counts as open, what needs
 * attention, what is overdue, what is confirmed test/spam, and the filters and
 * summary built from them. No I/O, so every predicate is unit-tested and the
 * page can state exactly what it means.
 *
 * ── Documented predicates ───────────────────────────────────────────────────
 *  open            ticket: status is not 'closed'.
 *                  lead:   status is new | contacted | qualified | scheduled
 *                          (won | lost | spam are resolved).
 *  needs attention ticket: open AND the latest message is not from support.
 *                          lead:   status is 'new'.
 *                          Never true for a confirmed test/spam record.
 *  overdue         a ticket that needs attention and has been waiting on us for at
 *                  least SUPPORT_OVERDUE_DAYS, counted from the first unanswered
 *                  customer message (see waitingSince), NOT from when the ticket was
 *                  opened. The threshold is a reply-time target chosen for a small
 *                  team, not a contractual SLA — adjust it here.
 *  confirmed noise a record explicitly marked test or spam:
 *                    leads   → status 'spam' (a constrained, existing status)
 *                    tickets → the newest row for the ticket in
 *                              support_ticket_triage_events is 'test' or 'spam'.
 *                              Only the platform owner writes it (POST
 *                              /api/admin/support/triage). That table exists only once
 *                              the local migration is applied, so until then NO ticket
 *                              is confirmed noise.
 *  unreviewed      anything not confirmed either way. Nothing is inferred from a
 *                  subject, shop name or message text.
 *
 * Confirmed test/spam records stay in the data and can be viewed; they are only
 * excluded from operational counts.
 */

export const SUPPORT_OVERDUE_DAYS = 2;

export type SupportTriage = 'real' | 'test' | 'spam' | 'unreviewed';
export type SupportSource = 'support_ticket' | 'shop_audit_lead';

/**
 * What the owner may set on a ticket. 'unreviewed' clears an earlier marking; it is
 * recorded as a new event, never as an edit. Mirrors the CHECK constraint in
 * supabase/migrations/2026-09-19_support_ticket_triage.sql.
 */
export const TICKET_TRIAGE_VALUES = ['real', 'test', 'spam', 'unreviewed'] as const satisfies ReadonlyArray<SupportTriage>;

const OPEN_LEAD_STATUSES = new Set(['new', 'contacted', 'qualified', 'scheduled']);

export function ticketTriage(raw: string | null | undefined): SupportTriage {
  return raw === 'real' || raw === 'test' || raw === 'spam' ? raw : 'unreviewed';
}

export function leadTriage(status: string | null | undefined): SupportTriage {
  if (status === 'spam') return 'spam';
  if (status === 'new' || !status) return 'unreviewed';
  return 'real'; // the owner has engaged with it (contacted → won/lost)
}

export function isConfirmedNoise(t: SupportTriage): boolean {
  return t === 'test' || t === 'spam';
}

export function isOpen(source: SupportSource, status: string | null): boolean {
  if (source === 'support_ticket') return status !== 'closed';
  return OPEN_LEAD_STATUSES.has(status ?? '');
}

export function needsAttention(
  source: SupportSource, status: string | null, triage: SupportTriage, lastMessageRole: string | null,
): boolean {
  if (isConfirmedNoise(triage)) return false;
  if (source === 'support_ticket') return status !== 'closed' && lastMessageRole !== 'support';
  return status === 'new';
}

export function ageInDays(createdAt: string, now: number = Date.now()): number {
  const ms = now - new Date(createdAt).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 86400000) : 0;
}

/** `waitingDays` is how long the ticket has been waiting on us — see waitingSince(). */
export function isOverdue(source: SupportSource, attention: boolean, waitingDays: number): boolean {
  return source === 'support_ticket' && attention && waitingDays >= SUPPORT_OVERDUE_DAYS;
}

/**
 * When a ticket started waiting on us: the earliest message in the unbroken run of
 * non-support messages at the end of the thread (the first customer message nobody
 * has answered yet). A ticket answered last week and followed up yesterday has been
 * waiting since yesterday, not since it was opened. `messagesNewestFirst` may be
 * empty (no messages read), in which case the ticket's own creation time is used.
 */
export function waitingSince(
  messagesNewestFirst: ReadonlyArray<{ author_role: string; created_at: string }>,
  ticketCreatedAt: string,
): string {
  let since: string | null = null;
  for (const m of messagesNewestFirst) {
    if (m.author_role === 'support') break;
    since = m.created_at;
  }
  return since ?? ticketCreatedAt;
}

/** The fields the queue rules need; SupportItem in supportData.ts extends this. */
export interface TriagedItem {
  source: SupportSource;
  status: string | null;
  triage: SupportTriage;
  open: boolean;
  needsAttention: boolean;
  ageDays: number;
  overdue: boolean;
}

export const SUPPORT_VIEWS = ['all', 'needs_attention', 'open', 'overdue', 'resolved', 'tickets', 'leads', 'test_spam'] as const;
export type SupportView = typeof SUPPORT_VIEWS[number];

export const SUPPORT_VIEW_LABELS: Record<SupportView, string> = {
  all: 'All',
  needs_attention: 'Needs attention',
  open: 'Open',
  overdue: 'Overdue',
  resolved: 'Resolved',
  tickets: 'Support tickets',
  leads: 'Shop-audit leads',
  test_spam: 'Confirmed test / spam',
};

export function sanitizeSupportView(view: unknown, legacyAttention?: unknown): SupportView {
  if (SUPPORT_VIEWS.includes(view as SupportView)) return view as SupportView;
  return legacyAttention === '1' ? 'needs_attention' : 'all';
}

export function filterSupportItems<T extends TriagedItem>(items: ReadonlyArray<T>, view: SupportView): T[] {
  switch (view) {
    case 'needs_attention': return items.filter(i => i.needsAttention);
    case 'open': return items.filter(i => i.open && !isConfirmedNoise(i.triage));
    case 'overdue': return items.filter(i => i.overdue);
    case 'resolved': return items.filter(i => !i.open && !isConfirmedNoise(i.triage));
    case 'tickets': return items.filter(i => i.source === 'support_ticket');
    case 'leads': return items.filter(i => i.source === 'shop_audit_lead');
    case 'test_spam': return items.filter(i => isConfirmedNoise(i.triage));
    default: return [...items];
  }
}

export interface SupportSummary {
  /** Open tickets, excluding confirmed test/spam. */
  openTickets: number;
  overdueTickets: number;
  /** Age of the oldest open ticket that is not confirmed test/spam. null when there is none. */
  oldestOpenTicketAgeDays: number | null;
  /** Open tickets nobody has classified as real, test or spam. */
  unreviewedOpenTickets: number;
  /** Leads with status 'new'. */
  newLeads: number;
  /** Records confirmed test or spam (kept, not counted above). */
  confirmedNoise: number;
}

export function summarizeSupport(items: ReadonlyArray<TriagedItem>): SupportSummary {
  const openTickets = items.filter(i => i.source === 'support_ticket' && i.open && !isConfirmedNoise(i.triage));
  return {
    openTickets: openTickets.length,
    overdueTickets: openTickets.filter(i => i.overdue).length,
    oldestOpenTicketAgeDays: openTickets.length ? Math.max(...openTickets.map(i => i.ageDays)) : null,
    unreviewedOpenTickets: openTickets.filter(i => i.triage === 'unreviewed').length,
    newLeads: items.filter(i => i.source === 'shop_audit_lead' && i.needsAttention).length,
    confirmedNoise: items.filter(i => isConfirmedNoise(i.triage)).length,
  };
}
