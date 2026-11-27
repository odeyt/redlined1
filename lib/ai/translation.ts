/**
 * English ⇄ Lao translation of estimate and invoice line descriptions.
 * Pure: no network, no database. Shared by the server route and the browser.
 *
 * Owner decision (2026-11-27): only part and service text is sent to the AI
 * provider — "brake pads", "MAF sensor". No customer names, phones, VINs or
 * prices. The UI only ever sends a line's description; this module also
 * refuses anything that looks like contact details and strips VIN-shaped
 * tokens, so a description someone typed a phone number into is not sent.
 */

export type Lang = 'en' | 'lo';

/** Longest description sent. Line descriptions are short; this bounds cost. */
export const MAX_TRANSLATE_CHARS = 200;
/** Ceiling on the reply. A line description never needs more. */
export const MAX_TRANSLATE_OUTPUT_TOKENS = 120;

const LAO_CHARS = /[຀-໿]/;
const VIN = /\b[A-HJ-NPR-Z0-9]{17}\b/gi;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** 8+ digits, allowing spaces, dashes, dots, parentheses and a leading +. */
const PHONE = /\+?\d[\d\s().-]{6,}\d/;

export function hasLao(text: string): boolean {
  return LAO_CHARS.test(text);
}

export type PrepareResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'empty' | 'too_long' | 'contact_details' };

/** What may be sent to the provider, or why not. */
export function prepareForTranslation(raw: unknown): PrepareResult {
  if (typeof raw !== 'string') return { ok: false, reason: 'empty' };
  const text = raw.replace(VIN, '').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length > MAX_TRANSLATE_CHARS) return { ok: false, reason: 'too_long' };
  if (EMAIL.test(text) || PHONE.test(text)) return { ok: false, reason: 'contact_details' };
  return { ok: true, text };
}

export function translationSystemPrompt(to: Lang): string {
  const target = to === 'lo' ? 'Lao (ພາສາລາວ)' : 'English';
  return [
    `You translate short auto repair line items for a repair shop in Laos into ${target}.`,
    'Each input is one part or service name from an estimate or invoice, such as "Brake pads" or "Replace MAF sensor".',
    'Use the words Lao mechanics and customers actually use. Keep brand names, part numbers, sizes and units (5W-30, 4L, Qt) exactly as written.',
    'Reply with the translation only: one line, no quotes, no explanation, no notes.',
  ].join(' ');
}

/** Tidy a model reply: first non-empty line, no wrapping quotes or labels. */
export function cleanTranslation(raw: string): string {
  const line = raw.split(/\r?\n/).map(s => s.trim()).find(Boolean) ?? '';
  return line
    .replace(/^(translation|lao|english)\s*:\s*/i, '')
    .replace(/^["'“”‘’「」]+|["'“”‘’「」]+$/g, '')
    .trim()
    .slice(0, MAX_TRANSLATE_CHARS * 2);
}

/**
 * Which way to translate a line when the 🌐 button is pressed:
 * English text present → to Lao; otherwise Lao text present → to English.
 */
export function translationDirection(description: string, laoDescription: string): { from: string; to: Lang } | null {
  const en = description.trim();
  const lo = laoDescription.trim();
  if (en && !hasLao(en)) return { from: en, to: 'lo' };
  if (lo) return { from: lo, to: 'en' };
  if (en) return { from: en, to: 'en' };   // Lao typed into the English box
  return null;
}
