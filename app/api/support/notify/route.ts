/**
 * POST /api/support/notify — tells the operator a customer wrote in.
 *
 * The inbox works, but nothing announced a new message: you had to remember to
 * open it. During a beta that is the same as having no support channel — the
 * first sign of a problem becomes a customer asking why nobody replied.
 *
 * Called by the widget after a ticket or message is saved, deliberately in that
 * order. The customer's message is already committed before this runs, so a
 * mail outage costs a notification, never their words.
 *
 * The email carries the whole message, so a reply can be decided from a phone
 * without opening the app, and links straight to the inbox for the reply
 * itself.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { alertException } from '@/lib/observability/alerts';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** Where support mail goes. Falls back to the address the rest of the app uses. */
function operatorRecipients(): string[] {
  const raw = process.env.SUPPORT_NOTIFY_EMAIL
    ?? process.env.PLATFORM_OWNER_EMAIL
    ?? 'admin@redlined1.com';
  return raw.split(',').map(e => e.trim()).filter(Boolean);
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function POST(req: NextRequest) {
  // Authenticated callers only: this sends mail, so an open endpoint is a spam
  // relay. The ticket is then re-read server-side rather than trusted from the
  // body, so a caller cannot dictate what the email says.
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  const { data: { user } } = token
    ? await anon.auth.getUser(token)
    : { data: { user: null } };
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { ticketId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.ticketId) return NextResponse.json({ error: 'ticketId is required' }, { status: 400 });

  if (!process.env.RESEND_API_KEY) {
    // Not an error the customer should see — their message is already saved.
    console.warn('[support/notify] RESEND_API_KEY not set; no notification sent');
    return NextResponse.json({ notified: false, reason: 'not_configured' });
  }

  try {
    const db = admin();

    const { data: ticket } = await db
      .from('support_tickets')
      .select('id, shop_id, kind, subject, severity, context, created_at')
      .eq('id', body.ticketId)
      .maybeSingle();
    if (!ticket) return NextResponse.json({ error: 'No such ticket' }, { status: 404 });

    // Confirm the caller belongs to the shop this ticket is on, so one customer
    // cannot trigger mail about another's thread.
    const { data: membership } = await db
      .from('shop_users').select('shop_id')
      .eq('user_id', user.id).eq('shop_id', ticket.shop_id).maybeSingle();
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const [{ data: shop }, { data: messages }] = await Promise.all([
      db.from('shops').select('name').eq('id', ticket.shop_id).maybeSingle(),
      db.from('support_messages').select('author_role, body, created_at')
        .eq('ticket_id', ticket.id).order('created_at', { ascending: true }),
    ]);

    const latest = [...(messages ?? [])].reverse().find(m => m.author_role === 'customer');
    const isBug = ticket.kind === 'bug';
    const shopName = shop?.name ?? 'Unknown shop';
    const sev = (ticket.severity ?? '').toUpperCase();

    const ctx = (ticket.context ?? {}) as Record<string, unknown>;
    const diagnostics = isBug
      ? ['path', 'viewport', 'timezone', 'language', 'userAgent']
          .filter(k => ctx[k])
          .map(k => `<tr><td style="padding:2px 10px 2px 0;color:#888">${k}</td><td style="color:#333">${esc(String(ctx[k]))}</td></tr>`)
          .join('')
      : '';

    const subject = isBug
      ? `🐞 ${sev ? sev + ' — ' : ''}Bug report from ${shopName}`
      : `💬 New support message from ${shopName}`;

    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: 'Redlined1 Support <onboarding@resend.dev>',
      to: operatorRecipients(),
      subject,
      html: `
        <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px">
          <p style="margin:0 0 4px;font-size:13px;color:#888">${isBug ? 'Bug report' : 'Support message'} · ${esc(shopName)}</p>
          <h2 style="margin:0 0 14px;font-size:17px;color:#111">${esc(ticket.subject || 'Conversation')}</h2>
          <div style="padding:14px 16px;background:#f6f6f8;border-radius:10px;border-left:3px solid #cc0000;white-space:pre-wrap;font-size:14px;line-height:1.55;color:#222">${esc(latest?.body ?? '(no message body)')}</div>
          ${diagnostics ? `<p style="margin:18px 0 6px;font-size:12px;color:#888;font-weight:600">DIAGNOSTICS</p><table style="font-size:12px;border-collapse:collapse">${diagnostics}</table>` : ''}
          <p style="margin:22px 0 0">
            <a href="https://www.redlined1.com/" style="background:#cc0000;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block">Reply in Support Inbox</a>
          </p>
          <p style="margin:14px 0 0;font-size:11px;color:#aaa">Sign in as the platform owner and open Support Inbox.</p>
        </div>`,
    });

    return NextResponse.json({ notified: true });
  } catch (err) {
    // Reported, not thrown at the customer: their message is saved either way,
    // and a mail failure that nobody sees is how a beta goes unanswered.
    alertException('support', err, { route: 'POST /api/support/notify', ticketId: body.ticketId });
    return NextResponse.json({ notified: false, reason: 'send_failed' });
  }
}
