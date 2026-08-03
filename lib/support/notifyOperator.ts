import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

/**
 * Emails the operator that a customer wrote in.
 *
 * Lives here rather than in a route so it can be called from the same server
 * operation that saves the message. The previous arrangement — client writes,
 * then client calls a notify endpoint — lost its first real notification
 * because the browser was running JavaScript from before the notify code
 * shipped. The message saved; the email never fired; nothing reported it.
 *
 * Returns whether mail was sent. Never throws for a mail problem: the
 * customer's message is already committed by the time this runs, and a mail
 * outage must not be reported to them as a failure to send.
 */

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** Where support mail goes. Falls back to the address the rest of the app uses. */
export function operatorRecipients(): string[] {
  const raw = process.env.SUPPORT_NOTIFY_EMAIL
    ?? process.env.PLATFORM_OWNER_EMAIL
    ?? 'admin@redlined1.com';
  return raw.split(',').map(e => e.trim()).filter(Boolean);
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function notifyOperatorOfSupportMessage(ticketId: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[support] RESEND_API_KEY not set — no notification sent');
    return false;
  }

  const db = admin();

  const { data: ticket } = await db
    .from('support_tickets')
    .select('id, shop_id, kind, subject, severity, context')
    .eq('id', ticketId)
    .maybeSingle();
  if (!ticket) return false;

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

  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
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

  // Resend reports a rejected send in the payload rather than by throwing —
  // an unchecked call here would look successful while nothing was delivered.
  if (error) {
    console.error('[support] Resend rejected the notification:', JSON.stringify(error));
    return false;
  }

  return true;
}
