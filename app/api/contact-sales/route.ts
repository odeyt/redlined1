import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const CONTEXT_LABELS: Record<string, string> = {
  enterprise: 'Enterprise Plan',
  migration: 'White-Glove Migration',
  general: 'General',
};

export async function POST(req: NextRequest) {
  try {
    const { name, email, shopName, context, message } = await req.json();
    if (!name || !email) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const contextLabel = CONTEXT_LABELS[context] ?? CONTEXT_LABELS.general;
    const inquiryTime = new Date().toLocaleString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });

    await resend.emails.send({
      from: 'Redlined1 <onboarding@resend.dev>',
      to: 'admin@redlined1.com',
      replyTo: email,
      subject: `📩 ${contextLabel} inquiry — ${shopName || name}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0d0d10;color:#eee;border-radius:12px;overflow:hidden">
          <div style="background:#cc0000;padding:20px 28px;display:flex;align-items:center;gap:14px">
            <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px">REDLINED<span style="color:#ffcccc">1</span></div>
            <div style="font-size:15px;font-weight:600;color:rgba(255,255,255,0.85);margin-left:4px">${contextLabel} Inquiry</div>
          </div>
          <div style="padding:28px">
            <div style="background:rgba(204,0,0,0.12);border:1px solid rgba(204,0,0,0.3);border-radius:10px;padding:20px 24px;margin-bottom:24px">
              <div style="font-size:13px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px">Contact Details</div>
              <table style="width:100%;border-collapse:collapse">
                <tr>
                  <td style="padding:7px 0;font-size:13px;color:#888;width:120px">Name</td>
                  <td style="padding:7px 0;font-size:14px;font-weight:700;color:#fff">${name}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;font-size:13px;color:#888">Shop Name</td>
                  <td style="padding:7px 0;font-size:14px;font-weight:700;color:#fff">${shopName || '—'}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;font-size:13px;color:#888">Email</td>
                  <td style="padding:7px 0;font-size:14px;font-weight:700;color:#cc6666">
                    <a href="mailto:${email}" style="color:#cc6666">${email}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:7px 0;font-size:13px;color:#888">Interest</td>
                  <td style="padding:7px 0;font-size:14px;font-weight:700;color:#4caf50">${contextLabel}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;font-size:13px;color:#888">Submitted</td>
                  <td style="padding:7px 0;font-size:13px;color:#aaa">${inquiryTime}</td>
                </tr>
              </table>
              ${message ? `<div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08)"><div style="font-size:13px;color:#888;margin-bottom:6px">Message</div><div style="font-size:14px;color:#ddd;white-space:pre-wrap">${message}</div></div>` : ''}
            </div>
            <p style="font-size:13px;color:#666;line-height:1.6;margin:0">
              Reply to this email to reach them directly at <strong style="color:#aaa">${email}</strong>.
            </p>
          </div>
          <div style="padding:14px 28px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#444;text-align:center">
            Redlined1 · Auto Shop Management Platform · www.redlined1.com
          </div>
        </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Contact sales error:', err);
    return NextResponse.json({ error: 'Failed to send inquiry' }, { status: 500 });
  }
}
