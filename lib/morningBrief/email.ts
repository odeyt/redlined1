/**
 * The morning-brief email, as HTML and plain text.
 *
 * The body is the DETERMINISTIC brief from lib/redline-ai/answers
 * (buildMorningBriefAnswer) — every figure already cited by document
 * number before it reaches this renderer. There is deliberately no LLM
 * pass for the email: the 05:00 send must be exactly as reliable as the
 * query layer, and a brief that invents a number once would never be
 * trusted again.
 *
 * Kept in the repository rather than as a dashboard template so the
 * wording is reviewed like code, versioned, and rendered in tests exactly
 * as it is sent — the trial-tips pattern (lib/trialTips/emails.ts).
 */

export interface MorningBriefEmailInput {
  shopName: string;
  /** The shop's local date, 'YYYY-MM-DD' — the date in the subject. */
  localDate: string;
  /** buildMorningBriefAnswer output for the shop's local date. */
  briefText: string;
  appUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The brief's first line ("Morning brief for <date>:") duplicates the
 *  subject and heading, so the body starts after it. */
function bodyLines(briefText: string): string[] {
  const lines = briefText.split('\n');
  if (lines.length && /^Morning brief for /.test(lines[0])) lines.shift();
  return lines;
}

export function renderMorningBriefEmail(input: MorningBriefEmailInput): RenderedEmail {
  const shop = input.shopName.trim() || 'Your shop';
  const subject = `Your morning brief — ${shop} — ${input.localDate}`;
  const panelUrl = input.appUrl.replace(/\/$/, '');

  const text = [
    input.briefText.trim(),
    '',
    `Open Redline AI: ${panelUrl}`,
    '',
    `${shop} · Redline AI by RedlineD1`,
  ].join('\n');

  const paragraphs = bodyLines(input.briefText)
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      const isItem = /^[•\d]/.test(trimmed);
      const style = isItem
        ? 'margin:0 0 6px;padding-left:16px;font-size:15px;line-height:1.5;color:#1a1a1a;'
        : 'margin:14px 0 6px;font-size:15px;line-height:1.5;font-weight:600;color:#1a1a1a;';
      return `<p style="${style}">${escapeHtml(trimmed)}</p>`;
    })
    .join('\n');

  const html = [
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px 16px;">',
    `<p style="margin:0 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#b91c1c;">Redline AI</p>`,
    `<h1 style="margin:0 0 4px;font-size:22px;color:#1a1a1a;">Your morning brief</h1>`,
    `<p style="margin:0 0 16px;font-size:14px;color:#666;">${escapeHtml(shop)} — ${escapeHtml(input.localDate)}</p>`,
    paragraphs,
    `<p style="margin:20px 0 0;"><a href="${escapeHtml(panelUrl)}" style="display:inline-block;background:#b91c1c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:15px;">Open Redline AI</a></p>`,
    `<p style="margin:24px 0 0;padding-top:12px;border-top:1px solid #e5e5e5;font-size:12px;color:#888;">${escapeHtml(shop)} · Redline AI by RedlineD1</p>`,
    '</div>',
  ].join('\n');

  return { subject, html, text };
}
