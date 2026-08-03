import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';

/**
 * In-app support: threads between a shop and the platform operator, plus bug
 * reports. Both are the same object — a thread with messages — distinguished by
 * `kind`.
 *
 * Every write checks that a row actually landed. A support message that
 * silently fails is worse than no support channel at all: the customer believes
 * they have reported a problem and waits for a reply that will never come.
 */

export type TicketKind = 'chat' | 'bug';
export type TicketStatus = 'open' | 'answered' | 'closed';
export type AuthorRole = 'customer' | 'support' | 'ai';

export interface SupportMessage {
  id: string;
  ticketId: string;
  authorRole: AuthorRole;
  body: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  kind: TicketKind;
  subject: string;
  status: TicketStatus;
  severity: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: SupportMessage[];
}

/**
 * Everything we can determine about where the customer was when they wrote.
 *
 * Collected automatically because a bug report without it is a guess, and
 * asking a shop owner for their browser version is how a report never gets
 * filed. Deliberately excludes anything they did not choose to tell us: no
 * keystrokes, no page contents, no customer records.
 */
export function captureContext(extra: Record<string, unknown> = {}): Record<string, unknown> {
  if (typeof window === 'undefined') return { ...extra };
  return {
    path: window.location.pathname + window.location.search,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    at: new Date().toISOString(),
    ...extra,
  };
}

function rowToMessage(r: Record<string, unknown>): SupportMessage {
  return {
    id:         String(r.id),
    ticketId:   String(r.ticket_id),
    authorRole: (r.author_role as AuthorRole) ?? 'customer',
    body:       String(r.body ?? ''),
    createdAt:  String(r.created_at ?? ''),
  };
}

function rowToTicket(r: Record<string, unknown>): SupportTicket {
  return {
    id:        String(r.id),
    kind:      (r.kind as TicketKind) ?? 'chat',
    subject:   String(r.subject ?? ''),
    status:    (r.status as TicketStatus) ?? 'open',
    severity:  (r.severity as string | null) ?? null,
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
}

/** Opens a thread and posts its first message. Returns the new ticket. */
export async function createTicket(input: {
  kind: TicketKind;
  subject: string;
  body: string;
  severity?: string;
  context?: Record<string, unknown>;
}): Promise<SupportTicket> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You need to be signed in to contact support.');

  const shopId = getShopId();
  if (!shopId) throw new Error('No active shop — reload the page and try again.');

  const { data: ticket, error: tErr } = await supabase
    .from('support_tickets')
    .insert({
      shop_id:    shopId,
      created_by: user.id,
      kind:       input.kind,
      subject:    input.subject.slice(0, 200),
      severity:   input.severity ?? null,
      context:    input.context ?? captureContext(),
    })
    .select()
    .single();

  if (tErr) throw new Error(`Could not open the ticket: ${tErr.message}`);
  if (!ticket) throw new Error('Could not open the ticket — no record was created.');

  const { error: mErr } = await supabase
    .from('support_messages')
    .insert({
      ticket_id:   ticket.id,
      shop_id:     shopId,
      author_id:   user.id,
      author_role: 'customer',
      body:        input.body,
    });

  // The thread exists but is empty. Say so rather than reporting success — an
  // empty ticket reads as spam to whoever picks it up, and the customer would
  // never know their words were lost.
  if (mErr) throw new Error(`Your message was not saved: ${mErr.message}`);

  return rowToTicket(ticket as Record<string, unknown>);
}

/** Posts a reply from the customer onto an existing thread. */
export async function postMessage(ticketId: string, body: string): Promise<SupportMessage> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You need to be signed in to reply.');

  const shopId = getShopId();
  const { data, error } = await supabase
    .from('support_messages')
    .insert({
      ticket_id:   ticketId,
      shop_id:     shopId,
      author_id:   user.id,
      author_role: 'customer',
      body,
    })
    .select()
    .single();

  if (error) throw new Error(`Message not sent: ${error.message}`);
  if (!data) throw new Error('Message not sent — no record was created.');
  return rowToMessage(data as Record<string, unknown>);
}

/** This shop's threads, newest first. */
export async function fetchTickets(): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return (data ?? []).map(r => rowToTicket(r as Record<string, unknown>));
}

/** Messages on one thread, oldest first — reading order. */
export async function fetchMessages(ticketId: string): Promise<SupportMessage[]> {
  const { data, error } = await supabase
    .from('support_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(r => rowToMessage(r as Record<string, unknown>));
}
