/**
 * Operator support inbox — platform owner only.
 *
 * GET  ?ticketId=…   messages on one thread
 * GET                every open thread across every shop
 * POST { ticketId, body }    reply as support
 * POST { ticketId, status }  close or reopen a thread
 *
 * Reads and writes with service_role deliberately. The customer-facing RLS
 * scopes everything through shop_users, so an operator — who belongs to no
 * customer's shop — would see nothing through it. The alternative, a policy
 * granting some "operator" identity access to every shop's rows, would put an
 * internal role into customer-facing RLS where a mistake exposes tenants to
 * each other. Authorisation happens here instead, in one place, before any
 * query runs.
 *
 * A support reply also cannot be written by the customer path at all: the
 * insert policy pins author_role to 'customer', so 'support' messages exist
 * only via this route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyPlatformOwner, forbidden } from '@/lib/adminAuth';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) {
    return auth.email ? forbidden(auth.reason) : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = admin();
  const ticketId = new URL(req.url).searchParams.get('ticketId');

  if (ticketId) {
    const { data, error } = await db
      .from('support_messages')
      .select('id, ticket_id, author_role, body, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ messages: data ?? [] });
  }

  const { data: tickets, error } = await db
    .from('support_tickets')
    .select('id, shop_id, kind, subject, status, severity, context, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Shop names, so the inbox reads as "Tapia Auto" rather than a UUID. Fetched
  // in one query rather than per ticket.
  const shopIds = [...new Set((tickets ?? []).map(t => t.shop_id))];
  const { data: shops } = shopIds.length
    ? await db.from('shops').select('id, name').in('id', shopIds)
    : { data: [] };
  const names = new Map((shops ?? []).map(s => [s.id, s.name]));

  // Who spoke last. An operator's first question of any inbox is "which of
  // these is waiting on me", and a thread whose last message is from the
  // customer is exactly that.
  const { data: last } = await db
    .from('support_messages')
    .select('ticket_id, author_role, created_at')
    .in('ticket_id', (tickets ?? []).map(t => t.id))
    .order('created_at', { ascending: false });

  const lastRole = new Map<string, string>();
  for (const m of last ?? []) {
    if (!lastRole.has(m.ticket_id)) lastRole.set(m.ticket_id, m.author_role);
  }

  return NextResponse.json({
    tickets: (tickets ?? []).map(t => ({
      ...t,
      shopName: names.get(t.shop_id) ?? '(unknown shop)',
      awaitingUs: lastRole.get(t.id) !== 'support' && t.status !== 'closed',
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) {
    return auth.email ? forbidden(auth.reason) : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { ticketId?: string; body?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const ticketId = body.ticketId;
  if (!ticketId) return NextResponse.json({ error: 'ticketId is required' }, { status: 400 });

  const db = admin();

  // Status change only.
  if (body.status && !body.body) {
    if (!['open', 'answered', 'closed'].includes(body.status)) {
      return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
    }
    const { error, count } = await db
      .from('support_tickets')
      .update({ status: body.status, updated_at: new Date().toISOString() }, { count: 'exact' })
      .eq('id', ticketId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (count === 0) return NextResponse.json({ error: 'No such ticket' }, { status: 404 });
    return NextResponse.json({ ok: true, status: body.status });
  }

  const text = (body.body ?? '').trim();
  if (!text) return NextResponse.json({ error: 'Write a reply first.' }, { status: 400 });

  // shop_id is denormalised onto messages for RLS, so the reply must carry the
  // ticket's own shop — not one supplied by the caller.
  const { data: ticket } = await db
    .from('support_tickets').select('id, shop_id').eq('id', ticketId).maybeSingle();
  if (!ticket) return NextResponse.json({ error: 'No such ticket' }, { status: 404 });

  const { data: inserted, error: mErr } = await db
    .from('support_messages')
    .insert({
      ticket_id:   ticket.id,
      shop_id:     ticket.shop_id,
      author_id:   null,          // support replies are from the team, not a person
      author_role: 'support',
      body:        text,
    })
    .select()
    .single();

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (!inserted) return NextResponse.json({ error: 'Reply was not saved' }, { status: 500 });

  // Best effort: the reply is the thing that matters, and a failed status
  // update must not report the reply as lost.
  await db
    .from('support_tickets')
    .update({ status: 'answered', updated_at: new Date().toISOString() })
    .eq('id', ticket.id);

  return NextResponse.json({ message: inserted });
}
