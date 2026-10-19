/**
 * Phone numbers → E.164 digits, the form the Cloud API expects in `to`
 * (digits only, country code first, no "+").
 *
 * Customer phones in RedlineD1 are typed by staff in whatever shape the
 * customer gave: "020 5555 1234", "+856 20 5555 1234", "+66 81 234 5678",
 * "856-20-55551234". The default country is Laos (+856) — D1 Imports' home —
 * because a local number with a trunk "0" is by far the common case there.
 * A Thai national number ("081 234 5678") is indistinguishable from a Lao
 * 030 number by shape, so it is read as Lao: Thai customers need +66 on file.
 *
 * Returns null for anything that cannot be a WhatsApp number. Never guesses
 * a country for a number that does not start with a trunk 0 or a known
 * country code: sending to a wrong number is worse than not sending.
 */

/** Country calling codes we accept a bare national number for, by trunk prefix. */
const DEFAULT_COUNTRY = '856';

export interface NormalizedPhone {
  /** Digits only, country code first — what Cloud API `to` takes. */
  e164Digits: string;
  /** "+856 20 5555 1234"-ish display form; never used for sending. */
  display: string;
}

export function normalizePhone(raw: string | null | undefined, defaultCountry = DEFAULT_COUNTRY): NormalizedPhone | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Reject anything with letters (extensions, notes like "call after 5").
  if (/[a-z]/i.test(trimmed)) return null;

  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (hasPlus) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = defaultCountry + digits.slice(1);
  } else if (digits.startsWith(defaultCountry) || digits.startsWith('66')) {
    // "856 20 …" or "66 81 …" typed without a plus.
  } else {
    return null;
  }

  // E.164: at most 15 digits; WhatsApp numbers are at least 8.
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith('0')) return null;

  // Laos mobile numbers are 856 20 XXXXXXXX (8 subscriber digits); a 7-digit
  // subscriber part is a legacy format that WhatsApp will not reach reliably,
  // but we still accept it — Meta returns a clear error if it is invalid.
  return { e164Digits: digits, display: formatDisplay(digits) };
}

function formatDisplay(d: string): string {
  if (d.startsWith('856') && d.length >= 11) return `+856 ${d.slice(3, 5)} ${d.slice(5, 9)} ${d.slice(9)}`;
  if (d.startsWith('66') && d.length === 11) return `+66 ${d.slice(2, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return `+${d}`;
}

/** "+856 •• ••••1234" — what staff screens show. The full number never leaves the server. */
export function maskPhone(e164Digits: string): string {
  if (!e164Digits) return '';
  const last4 = e164Digits.slice(-4);
  const cc = e164Digits.startsWith('856') ? '856' : e164Digits.startsWith('66') ? '66' : e164Digits.slice(0, 2);
  return `+${cc} •••• ${last4}`;
}

/** Calling code of a normalized number, for eligibility checks. */
export function callingCode(e164Digits: string): string {
  for (const len of [3, 2, 1]) {
    const cc = e164Digits.slice(0, len);
    if (KNOWN_CODES.has(cc)) return cc;
  }
  return e164Digits.slice(0, 3);
}

// Only the codes this module needs to recognise for eligibility messaging.
const KNOWN_CODES = new Set(['1', '7', '27', '44', '61', '66', '81', '82', '84', '86', '90', '234', '855', '856', '63', '62', '60', '65', '95', '91']);
