import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

export async function POST(req: NextRequest) {
  try {
    const { name, shopName, email } = await req.json();
    if (!name || !email) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const signupTime = new Date().toLocaleString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });

    await resend.emails.send({
      from: 'Redlined1 <onboarding@resend.dev>',
      to: 'sales@d1autozone.com',
      replyTo: email,
      subject: `🆕 New Trial Signup — ${shopName || name}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0d0d10;color:#eee;border-radius:12px;overflow:hidden">
          <div style="background:#cc0000;padding:20px 28px;display:flex;align-items:center;gap:14px">
            <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px">REDLINED<span style="color:#ffcccc">1</span></div>
            <div style="font-size:15px;font-weight:600;color:rgba(255,255,255,0.85);margin-left:4px">New Trial Signup</div>
          </div>
          <div style="padding:28px">
            <div style="background:rgba(204,0,0,0.12);border:1px solid rgba(204,0,0,0.3);border-radius:10px;padding:20px 24px;margin-bottom:24px">
              <div style="font-size:13px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px">New Account Details</div>
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
                  <td style="padding:7px 0;font-size:13px;color:#888">Plan</td>
                  <td style="padding:7px 0;font-size:14px;font-weight:700;color:#4caf50">7-Day Free Trial</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;font-size:13px;color:#888">Signed up</td>
                  <td style="padding:7px 0;font-size:13px;color:#aaa">${signupTime}</td>
                </tr>
              </table>
            </div>
            <p style="font-size:13px;color:#666;line-height:1.6;margin:0">
              Reply to this email to reach the new customer directly at <strong style="color:#aaa">${email}</strong>.
              <br/>Follow up within 24 hours to maximize conversion.
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
    console.error('Signup notify error:', err);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
