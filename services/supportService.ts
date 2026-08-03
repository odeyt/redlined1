import { supabase } from '@/lib/supabase';

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

/**
 * Sends a message to support, opening a thread if there isn't one.
 *
 * One request to one server route, which saves the message AND notifies the
 * operator. It previously inserted directly through RLS and then called a
 * notify endpoint separately; the first real test lost its notification
 * because the page was running JavaScript from before the notify code shipped.
 * The ticket saved, the email never fired, and nothing reported it.
 *
 * Anything the client must remember to do second, it eventually will not do.
 */
async function postToSupport(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('You need to be signed in to contact support.');

  const res = await fetch('/api/support/message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  // Read as text first — an error page is not JSON, and res.json() on one
  // throws "Unexpected end of JSON input", which explains nothing.
  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try { data = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { /* handled below */ }

  if (!res.ok) {
    throw new Error(String(data.error ?? `Your message could not be sent (HTTP ${res.status}).`));
  }
  return data;
}

/** Opens a thread and posts its first message. Returns the new ticket. */
export async function createTicket(input: {
  kind: TicketKind;
  subject: string;
  body: string;
  severity?: string;
  context?: Record<string, unknown>;
}): Promise<SupportTicket> {
  const data = await postToSupport({
    kind:     input.kind,
    subject:  input.subject.slice(0, 200),
    body:     input.body,
    severity: input.severity,
    context:  input.context ?? captureContext(),
  });

  return {
    id:        String(data.ticketId ?? ''),
    kind:      input.kind,
    subject:   input.subject,
    status:    'open',
    severity:  input.severity ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Posts a reply from the customer onto an existing thread.
 *
 * Same single server operation as opening a thread, so a reply notifies too — a
 * customer answering a follow-up is exactly when the thread must not go cold.
 */
export async function postMessage(ticketId: string, body: string): Promise<SupportMessage> {
  const data = await postToSupport({ ticketId, body });
  return rowToMessage((data.message ?? {}) as Record<string, unknown>);
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
