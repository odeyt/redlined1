/**
 * lib/admin/supportData.ts
 * SERVER ONLY. Read-only, unified view of "questions, reported issues, and
 * billing exceptions" for the owner-admin Support page.
 *
 * Two real sources exist today:
 *  - support_tickets / support_messages — in-app customer chat and bug
 *    reports, already platform-owner gated (see app/api/support/inbox/route.ts,
 *    which this module deliberately mirrors for read access but never writes
 *    to — reply/close stays in the existing inbox, this page is read-only).
 *  - shop_audit_leads — the marketing "free shop audit" funnel. Its
 *    migration (supabase/migrations/2026-09-13_shop_audit_leads.sql) is
 *    marked "NOT YET APPLIED" as of this build, so a missing-relation error
 *    here means "not configured", not a bug — every query against it is
 *    wrapped accordingly.
 *
 * /api/contact-sales sends an email only and persists nothing — there is no
 * database record to surface for it (documented in the Phase B data map;
 * not fabricated here).
 *
 * Message/lead free-text bodies are never included in the list shape this
 * module returns — only short, structured fields meant to be read by the
 * owner (ticket subject, lead company name). Nothing here is ever logged.
 *
 * What "open", "needs attention", "overdue" and "confirmed test/spam" mean is
 * defined once, in lib/admin/supportTriage.ts. Nothing is classified from a
 * subject, shop name or message text, and no record is ever modified here.
 */
import 'server-only';
import { getAdminDb } from '@/lib/supabaseServer';
import {
  ageInDays, isOpen, isOverdue, leadTriage, needsAttention as computeNeedsAttention, summarizeSupport, ticketTriage, waitingSince,
  type SupportSource, type SupportSummary, type SupportTriage,
} from '@/lib/admin/supportTriage';

export type SupportItemSource = SupportSource;

export interface SupportItem {
  id: string;
  source: SupportItemSource;
  type: string;
  subject: string;
  shopId: string | null;
  shopName: string | null;
  /** shops.id — the account directory's canonical identifier — or null if none could be resolved. */
  accountId: string | null;
  /** True when accountId is a best-effort email correlation (shop_audit_leads has no FK to a shop), not a confirmed record link. */
  accountMatchIsHeuristic: boolean;
  createdAt: string;
  status: string | null;
  severity: string | null;
  needsAttention: boolean;
  /** real | test | spam | unreviewed. Only an explicit marker confirms test/spam. */
  triage: SupportTriage;
  open: boolean;
  /** Whole days since the record was created. */
  ageDays: number;
  /** Days the ticket has been waiting on us (from the first unanswered customer message). null when it is not waiting on us, and for leads. */
  waitingDays: number | null;
  /** Needs attention and waiting on us for at least SUPPORT_OVERDUE_DAYS. Tickets only. */
  overdue: boolean;
}

export interface SupportListResult {
  items: SupportItem[];
  sources: {
    supportTickets: 'available' | 'unavailable';
    shopAuditLeads: 'available' | 'not_configured';
  };
  /**
   * False until support_ticket_triage_events exists (local migration, not yet applied),
   * or whenever it cannot be read: no ticket can then be confirmed test/spam and all are "unreviewed".
   */
  triageSupported: boolean;
  summary: SupportSummary;
  /** True when a source returned MAX_ITEMS_PER_SOURCE rows: older records exist that are not counted. */
  truncated: boolean;
  maxItemsPerSource: number;
}

const MAX_ITEMS_PER_SOURCE = 200;

export async function listSupportItems(now: number = Date.now()): Promise<SupportListResult> {
  const db = getAdminDb();

  const [ticketResult, leadItems, ticketsAvailable, leadsAvailable] = await Promise.all([
    loadSupportTickets(db, now),
    loadShopAuditLeads(db, now),
    probeTableAvailable(db, 'support_tickets'),
    probeTableAvailable(db, 'shop_audit_leads'),
  ]);

  const items = [...ticketResult.items, ...leadItems].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    items,
    sources: {
      // A ticket read that failed after the table probe passed (a bad column, a partial outage) is just as
      // unavailable: an empty list from a failed read must never look like an empty queue.
      supportTickets: ticketsAvailable && !ticketResult.failed ? 'available' : 'unavailable',
      shopAuditLeads: leadsAvailable ? 'available' : 'not_configured',
    },
    triageSupported: ticketResult.triageSupported,
    summary: summarizeSupport(items),
    truncated: ticketResult.items.length >= MAX_ITEMS_PER_SOURCE || leadItems.length >= MAX_ITEMS_PER_SOURCE,
    maxItemsPerSource: MAX_ITEMS_PER_SOURCE,
  };
}

async function probeTableAvailable(db: ReturnType<typeof getAdminDb>, table: string): Promise<boolean> {
  try {
    const { error } = await db.from(table).select('*', { count: 'exact', head: true }).limit(1);
    return !error;
  } catch {
    return false;
  }
}

const TICKET_COLUMNS = 'id, shop_id, created_by, kind, subject, status, severity, created_at';

/** Marker rows read, newest first. Older history beyond this is not needed to know the current marker. */
const TRIAGE_EVENT_LIMIT = 2000;

/**
 * The current marker of each ticket is its newest row in support_ticket_triage_events.
 * `supported` is false when the table cannot be read (migration not applied, or an
 * error): every ticket is then "unreviewed" — the safe direction, since an unreviewed
 * ticket is still counted and shown.
 */
async function readTriageMarkers(
  db: ReturnType<typeof getAdminDb>,
  ticketIds: string[],
): Promise<{ supported: boolean; byTicket: Map<string, string> }> {
  const byTicket = new Map<string, string>();
  try {
    const base = db.from('support_ticket_triage_events').select('ticket_id, triage');
    const { data, error } = await (ticketIds.length ? base.in('ticket_id', ticketIds) : base)
      .order('id', { ascending: false })
      .limit(TRIAGE_EVENT_LIMIT);
    if (error) return { supported: false, byTicket };
    for (const row of (data ?? []) as Array<{ ticket_id: string; triage: string }>) {
      if (!byTicket.has(row.ticket_id)) byTicket.set(row.ticket_id, row.triage); // newest first: first seen is current
    }
    return { supported: true, byTicket };
  } catch {
    return { supported: false, byTicket };
  }
}

async function loadSupportTickets(
  db: ReturnType<typeof getAdminDb>,
  now: number,
): Promise<{ items: SupportItem[]; triageSupported: boolean; failed?: boolean }> {
  try {
    type TicketRow = {
      id: string; shop_id: string | null; created_by: string | null; kind: string; subject: string | null;
      status: string; severity: string | null; created_at: string;
    };
    const ticketRes = await db
      .from('support_tickets')
      .select(TICKET_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(MAX_ITEMS_PER_SOURCE);
    if (ticketRes.error) throw ticketRes.error;
    const tickets = ticketRes.data as unknown as TicketRow[] | null;

    // The owner's real / test / spam markers live in their own table (see
    // supabase/migrations/2026-09-19_support_ticket_triage.sql). Until that migration
    // is applied the read fails, and that must degrade to "unreviewed" — never to an
    // empty support queue and never to a guess.
    const { supported: triageSupported, byTicket: triageByTicket } = await readTriageMarkers(db, (tickets ?? []).map(t => t.id));
    if (!tickets || tickets.length === 0) return { items: [], triageSupported };

    const shopIds = [...new Set(tickets.map(t => t.shop_id).filter(Boolean))];
    const { data: shops } = shopIds.length
      ? await db.from('shops').select('id, name').in('id', shopIds)
      : { data: [] as { id: string; name: string | null }[] };
    const shopNames = new Map((shops ?? []).map(s => [s.id, s.name]));

    // Same "who is waiting on us" signal as the existing operator inbox —
    // read-only here, no status/reply mutation.
    const ticketIds = tickets.map(t => t.id);
    const { data: lastMsgs } = ticketIds.length
      ? await db
          .from('support_messages')
          .select('ticket_id, author_role, created_at')
          .in('ticket_id', ticketIds)
          .order('created_at', { ascending: false })
      : { data: [] as { ticket_id: string; author_role: string; created_at: string }[] };

    // Newest first per ticket. lastRole is the latest author; the whole list gives
    // waitingSince(). A ticket with no message read is treated as waiting on us and
    // dated from its creation: surfacing it is safer than hiding it.
    const lastRole = new Map<string, string>();
    const messagesByTicket = new Map<string, Array<{ author_role: string; created_at: string }>>();
    for (const m of lastMsgs ?? []) {
      if (!lastRole.has(m.ticket_id)) lastRole.set(m.ticket_id, m.author_role);
      const list = messagesByTicket.get(m.ticket_id) ?? [];
      list.push({ author_role: m.author_role, created_at: m.created_at });
      messagesByTicket.set(m.ticket_id, list);
    }

    const items = tickets.map(t => {
      const triage = ticketTriage(triageByTicket.get(t.id));
      const attention = computeNeedsAttention('support_ticket', t.status, triage, lastRole.get(t.id) ?? null);
      const age = ageInDays(t.created_at, now);
      const waiting = ageInDays(waitingSince(messagesByTicket.get(t.id) ?? [], t.created_at), now);
      return {
        id: t.id,
        source: 'support_ticket' as const,
        type: t.kind,
        subject: t.subject || (t.kind === 'bug' ? 'Bug report' : 'Support conversation'),
        shopId: t.shop_id,
        shopName: t.shop_id ? (shopNames.get(t.shop_id) ?? '(unknown shop)') : null,
        // shop_id is the ticket's own field (not an email-correlation guess) —
        // it IS the account directory's canonical identifier.
        accountId: t.shop_id ?? null,
        accountMatchIsHeuristic: false,
        createdAt: t.created_at,
        status: t.status,
        severity: t.severity,
        needsAttention: attention,
        triage,
        open: isOpen('support_ticket', t.status),
        ageDays: age,
        waitingDays: attention ? waiting : null,
        overdue: isOverdue('support_ticket', attention, waiting),
      };
    });
    return { items, triageSupported };
  } catch {
    return { items: [], triageSupported: false, failed: true };
  }
}

/**
 * shop_audit_leads is an ANONYMOUS, pre-signup lead-capture form (see
 * app/api/shop-audit/route.ts: "a shop owner should not need an account to
 * ask for an audit"). It carries no user_id/profile_id and has no FK to
 * shops or profiles. A row here is not proof that the submitter ever signed
 * up, and is never treated as signup attribution (see getAccountDetail,
 * which reports signup attribution as MISSING unconditionally). The email
 * correlation below is only a support-triage hint — "this lead's email
 * matches a profile that belongs to shop X" — surfaced here under
 * Support/Leads, exactly where it belongs, and nowhere else. A display name
 * is never used to link a record to an account.
 */
async function loadShopAuditLeads(db: ReturnType<typeof getAdminDb>, now: number): Promise<SupportItem[]> {
  try {
    const { data: leads, error } = await db
      .from('shop_audit_leads')
      .select('id, email, shop_name, source, status, created_at')
      .order('created_at', { ascending: false })
      .limit(MAX_ITEMS_PER_SOURCE);
    if (error) throw error;
    if (!leads) return [];

    const emails = [...new Set(leads.map(l => l.email).filter(Boolean))];
    const { data: profiles } = emails.length
      ? await db.from('profiles').select('email, shop_id').in('email', emails)
      : { data: [] as { email: string | null; shop_id: string | null }[] };
    const shopIdByEmail = new Map((profiles ?? []).map(p => [p.email, p.shop_id]));

    return leads.map(l => {
      const triage = leadTriage(l.status);
      return {
        id: l.id,
        source: 'shop_audit_lead' as const,
        type: 'shop_audit_lead',
        subject: l.shop_name || '(shop audit submission)',
        shopId: null,
        shopName: l.shop_name,
        accountId: l.email ? shopIdByEmail.get(l.email) ?? null : null,
        accountMatchIsHeuristic: true,
        createdAt: l.created_at,
        status: l.status,
        severity: null,
        needsAttention: computeNeedsAttention('shop_audit_lead', l.status, triage, null),
        triage,
        open: isOpen('shop_audit_lead', l.status),
        ageDays: ageInDays(l.created_at, now),
        waitingDays: null,
        overdue: false,
      };
    });
  } catch {
    return [];
  }
}
