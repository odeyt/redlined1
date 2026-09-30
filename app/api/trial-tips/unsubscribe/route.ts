/**
 * Unsubscribe from trial tips, from the link in every email.
 *
 *   GET   a small page with one button. Opening the link does NOT unsubscribe
 *         by itself: mail scanners and link previews fetch URLs, and a person
 *         should not be unsubscribed by their spam filter.
 *   POST  unsubscribes. Used by that button and by mail clients' own
 *         "Unsubscribe" (RFC 8058 one-click, List-Unsubscribe-Post).
 *
 * No sign-in: the HMAC in the link proves it was sent to this person. Every
 * failure returns the same page, so the endpoint reveals nothing about
 * whether an id exists. Account and billing emails are unaffected.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { verifyUnsubscribeToken } from '@/lib/trialTips/unsubscribeToken';
import { unsubscribe } from '@/lib/trialTips/consent';

function page(title: string, body: string, status = 200): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${title}</title></head>
<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#f4f4f5;color:#18181b;">
<main style="max-width:480px;margin:48px auto;padding:28px;background:#fff;border-radius:10px;">
<h1 style="font-size:20px;margin:0 0 12px;">${title}</h1>${body}</main></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}

const INVALID = () => page('This link is not valid',
  '<p style="line-height:1.6;">This unsubscribe link is incomplete or has been changed. Use the link from the latest email, or switch trial tips off in RedlineD1 under Settings.</p>', 400);

function attr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function params(req: NextRequest): { u: string; t: string } {
  return { u: req.nextUrl.searchParams.get('u') ?? '', t: req.nextUrl.searchParams.get('t') ?? '' };
}

export async function GET(req: NextRequest) {
  const secret = process.env.TRIAL_TIPS_UNSUBSCRIBE_SECRET;
  const { u, t } = params(req);
  if (!secret || !verifyUnsubscribeToken(u, t, secret)) return INVALID();

  const action = `/api/trial-tips/unsubscribe?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`;
  return page('Unsubscribe from trial tips?',
    `<p style="line-height:1.6;">You will stop receiving RedlineD1 trial-tip emails. Account and billing emails are not affected.</p>
<form method="post" action="${attr(action)}"><input type="hidden" name="source" value="link">
<button type="submit" style="margin-top:8px;padding:12px 20px;font-size:15px;font-weight:bold;border:0;border-radius:8px;background:#cc0000;color:#fff;cursor:pointer;">Unsubscribe</button></form>`);
}

export async function POST(req: NextRequest) {
  const secret = process.env.TRIAL_TIPS_UNSUBSCRIBE_SECRET;
  const { u, t } = params(req);
  if (!secret || !verifyUnsubscribeToken(u, t, secret)) return INVALID();

  // The page's button posts source=link; a mail client's one-click posts
  // List-Unsubscribe=One-Click.
  let source: 'link' | 'one_click' = 'one_click';
  try {
    const form = await req.formData();
    if (form.get('source') === 'link') source = 'link';
  } catch { /* one-click bodies may be empty */ }

  try {
    await unsubscribe(createServerSupabase(), u, source);
  } catch {
    return page('Something went wrong',
      '<p style="line-height:1.6;">We could not update your preference just now. Please try the link again in a few minutes.</p>', 500);
  }
  return page('You are unsubscribed',
    '<p style="line-height:1.6;">You will not receive any more RedlineD1 trial tips. You can switch them back on in Settings if you change your mind.</p>');
}
