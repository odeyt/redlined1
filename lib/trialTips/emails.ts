/**
 * The four trial-tips emails, as HTML and plain text.
 *
 * Kept in the repository rather than as dashboard templates so the wording is
 * reviewed like code, versioned, and rendered in tests exactly as it is sent.
 *
 * Every email carries, in both HTML and text:
 *   - why the person is getting it (they asked, at signup or in Settings);
 *   - a working unsubscribe link;
 *   - the business's physical mailing address.
 * The last two are what US law (CAN-SPAM) requires of commercial email. The
 * renderer refuses to produce a sendable email without them; previews use
 * clearly marked placeholders instead.
 */
import type { TrialTipStep } from './config';

export interface TrialTipEmailInput {
  shopName: string | null;
  appUrl: string;
  unsubscribeUrl: string;
  postalAddress: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface StepCopy {
  subject: (shop: string) => string;
  heading: string;
  paragraphs: (shop: string) => string[];
  cta: string;
}

const COPY: Record<TrialTipStep, StepCopy> = {
  first_job: {
    subject: () => 'Put your first job into RedlineD1',
    heading: 'Start with one real job',
    paragraphs: shop => [
      `Welcome to RedlineD1${shop ? `, ${shop}` : ''}. The quickest way to see whether it fits your shop is to run one real job through it.`,
      'Open Job Cards, choose + New Job Card, and add the customer, the vehicle and what they came in for. Everything else — the inspection, estimate, repair order and invoice — links back to that one card.',
      'It takes about two minutes, and it is the job you would have written down anyway.',
    ],
    cta: 'Create a job card',
  },
  setup_help: {
    subject: () => 'Make RedlineD1 look like your shop',
    heading: 'Two settings worth five minutes',
    paragraphs: shop => [
      `A couple of days into your trial${shop ? `, ${shop}` : ''} — here is what makes the biggest difference next.`,
      'In Settings → Shop Branding, add your shop name, logo, address and phone number. They appear on every estimate and invoice your customers see.',
      'Then invite the people who work with you from Access, so each technician and advisor signs in as themselves and their work is recorded under their name.',
    ],
    cta: 'Open Settings',
  },
  status_board: {
    subject: () => 'Stop answering "is my car ready yet?"',
    heading: 'Let customers check their own repair',
    paragraphs: () => [
      'Every job card in RedlineD1 can have a live status page you send to the customer. It shows where their vehicle is — checked in, being inspected, waiting for parts, in repair, in quality check — and updates as your team moves the job along.',
      'No app, no login for them. Fewer calls to the front desk for you.',
      'Open any job card and share its status link to try it.',
    ],
    cta: 'Open your job cards',
  },
  feedback: {
    subject: () => 'Your trial is nearly over — how did it go?',
    heading: 'One question before your trial ends',
    paragraphs: shop => [
      `Your RedlineD1 trial${shop ? ` for ${shop}` : ''} is nearly over. After that your shop keeps working on the Free plan — nothing is deleted.`,
      'Before then, we would really like to know: what worked, and what got in the way? Just reply to this email. A person reads every reply.',
      'If you want every feature to carry on, you can choose a plan any time from Settings → Subscriptions.',
    ],
    cta: 'Choose a plan',
  },
};

const CTA_PATH: Record<TrialTipStep, string> = {
  first_job: '/',
  setup_help: '/',
  status_board: '/',
  feedback: '/',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Shop names come from signup; keep them short and single-line. */
function cleanShopName(name: string | null): string {
  return (name ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80);
}

export class TrialTipRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrialTipRenderError';
  }
}

export function renderTrialTipEmail(step: TrialTipStep, input: TrialTipEmailInput): RenderedEmail {
  if (!input.postalAddress.trim()) throw new TrialTipRenderError('A postal address is required to render a trial-tips email.');
  if (!input.unsubscribeUrl.trim()) throw new TrialTipRenderError('An unsubscribe link is required to render a trial-tips email.');

  const copy = COPY[step];
  const shop = cleanShopName(input.shopName);
  const ctaUrl = new URL(CTA_PATH[step], input.appUrl).toString();
  const subject = copy.subject(shop);
  const paragraphs = copy.paragraphs(shop);
  const why = 'You are receiving this because you asked for RedlineD1 trial tips when you signed up or in Settings.';
  const address = input.postalAddress.trim();

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;">
        <tr><td style="background:#cc0000;color:#ffffff;padding:16px 24px;font-size:18px;font-weight:bold;">RedlineD1</td></tr>
        <tr><td style="padding:24px;">
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${escapeHtml(copy.heading)}</h1>
          ${paragraphs.map(p => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">${escapeHtml(p)}</p>`).join('\n          ')}
          <p style="margin:22px 0 4px;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#cc0000;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px;">${escapeHtml(copy.cta)}</a></p>
        </td></tr>
        <tr><td style="padding:16px 24px 24px;border-top:1px solid #e4e4e7;font-size:12px;line-height:1.6;color:#52525b;">
          <p style="margin:0 0 8px;">${escapeHtml(why)}</p>
          <p style="margin:0 0 8px;"><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#52525b;">Unsubscribe from trial tips</a> — account and billing emails are not affected.</p>
          <p style="margin:0;">RedlineD1 · ${escapeHtml(address)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    copy.heading,
    '',
    ...paragraphs.flatMap(p => [p, '']),
    `${copy.cta}: ${ctaUrl}`,
    '',
    '—',
    why,
    `Unsubscribe from trial tips: ${input.unsubscribeUrl}`,
    `RedlineD1 · ${address}`,
    '',
  ].join('\n');

  return { subject, html, text };
}
