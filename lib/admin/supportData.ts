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
 */
import 'server-only';
import { getAdminDb } from '@/lib/supabaseServer';

export type SupportItemSource = 'support_ticket' | 'shop_audit_lead';

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
}

export interface SupportListResult {
  items: SupportItem[];
  sources: {
    supportTickets: 'available' | 'unavailable';
    shopAuditLeads: 'available' | 'not_configured';
  };
}

const MAX_ITEMS_PER_SOURCE = 200;

export async function listSupportItems(): Promise<SupportListResult> {
  const db = getAdminDb();

  const [ticketItems, leadItems, ticketsAvailable, leadsAvailable] = await Promise.all([
    loadSupportTickets(db),
    loadShopAuditLeads(db),
    probeTableAvailable(db, 'support_tickets'),
    probeTableAvailable(db, 'shop_audit_leads'),
  ]);

  const items = [...ticketItems, ...leadItems].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    items,
    sources: {
      supportTickets: ticketsAvailable ? 'available' : 'unavailable',
      shopAuditLeads: leadsAvailable ? 'available' : 'not_configured',
    },
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

async function loadSupportTickets(db: ReturnType<typeof getAdminDb>): Promise<SupportItem[]> {
  try {
    const { data: tickets, error } = await db
      .from('support_tickets')
      .select('id, shop_id, created_by, kind, subject, status, severity, created_at')
      .order('created_at', { ascending: false })
      .limit(MAX_ITEMS_PER_SOURCE);
    if (error) throw error;
    if (!tickets || tickets.length === 0) return [];

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

    const lastRole = new Map<string, string>();
    for (const m of lastMsgs ?? []) {
      if (!lastRole.has(m.ticket_id)) lastRole.set(m.ticket_id, m.author_role);
    }

    return tickets.map(t => ({
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
      needsAttention: t.status !== 'closed' && lastRole.get(t.id) !== 'support',
    }));
  } catch {
    return [];
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
 * Support/Leads, exactly where it belongs, and nowhere else.
 */
async function loadShopAuditLeads(db: ReturnType<typeof getAdminDb>): Promise<SupportItem[]> {
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

    return leads.map(l => ({
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
      needsAttention: l.status === 'new',
    }));
  } catch {
    return [];
  }
}
