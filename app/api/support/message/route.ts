/**
 * POST /api/support/message — the single way a customer writes to support.
 *
 * Creates the thread if there isn't one, appends the message, and notifies the
 * operator, in one request.
 *
 * It replaced a client-side insert followed by a separate call to
 * /api/support/notify. That worked exactly as long as the browser did both
 * halves: the first real test lost its notification because the page was
 * running JavaScript from before the notify code shipped. The ticket saved, the
 * email never fired, and nothing anywhere reported a problem.
 *
 * Anything the client has to remember to do second, it will eventually not do —
 * a stale bundle, a blocked request, a closed tab. Writing and notifying in one
 * server-side operation removes the gap rather than narrowing it.
 *
 * Membership is resolved from the caller's own session, so a customer cannot
 * write into another shop's thread even though this runs with service_role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyOperatorOfSupportMessage } from '@/lib/support/notifyOperator';
import { alertException } from '@/lib/observability/alerts';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  const { data: { user } } = token ? await anon.auth.getUser(token) : { data: { user: null } };
  if (!user) return NextResponse.json({ error: 'You need to be signed in to contact support.' }, { status: 401 });

  let body: {
    ticketId?: string; kind?: 'chat' | 'bug'; subject?: string;
    body?: string; severity?: string; context?: Record<string, unknown>;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const text = (body.body ?? '').trim();
  if (!text) return NextResponse.json({ error: 'Write a message first.' }, { status: 400 });
  if (text.length > 20000) return NextResponse.json({ error: 'That message is too long.' }, { status: 400 });

  const db = admin();

  // The caller's shop, from their own membership — never from the request.
  const { data: membership } = await db
    .from('shop_users').select('shop_id').eq('user_id', user.id).limit(1).maybeSingle();
  const shopId = membership?.shop_id;
  if (!shopId) {
    return NextResponse.json({ error: 'No shop is attached to your account yet. Reload and try again.' }, { status: 400 });
  }

  try {
    let ticketId = body.ticketId ?? '';

    if (ticketId) {
      // Replying: the thread must belong to the caller's shop.
      const { data: existing } = await db
        .from('support_tickets').select('id, shop_id').eq('id', ticketId).maybeSingle();
      if (!existing || existing.shop_id !== shopId) {
        return NextResponse.json({ error: 'That conversation was not found.' }, { status: 404 });
      }
    } else {
      const { data: ticket, error: tErr } = await db
        .from('support_tickets')
        .insert({
          shop_id:    shopId,
          created_by: user.id,
          kind:       body.kind === 'bug' ? 'bug' : 'chat',
          subject:    (body.subject ?? text).slice(0, 200),
          severity:   body.severity ?? null,
          context:    body.context ?? {},
        })
        .select('id').single();

      if (tErr || !ticket) throw new Error(`Could not open the ticket: ${tErr?.message ?? 'no row created'}`);
      ticketId = ticket.id;
    }

    const { data: message, error: mErr } = await db
      .from('support_messages')
      .insert({ ticket_id: ticketId, shop_id: shopId, author_id: user.id, author_role: 'customer', body: text })
      .select().single();

    if (mErr || !message) throw new Error(`Your message was not saved: ${mErr?.message ?? 'no row created'}`);

    // Awaited, so a mail failure is known here rather than discovered when a
    // customer asks why nobody replied. It still does not fail the request —
    // the message is saved, and telling the customer "not sent" would be false.
    const notified = await notifyOperatorOfSupportMessage(ticketId).catch(err => {
      alertException('support', err, { route: 'POST /api/support/message', ticketId });
      return false;
    });

    return NextResponse.json({ ticketId, message, notified });
  } catch (err) {
    alertException('support', err, { route: 'POST /api/support/message', userId: user.id });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Your message could not be sent.' },
      { status: 500 },
    );
  }
}
