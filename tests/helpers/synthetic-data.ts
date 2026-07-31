/**
 * Every record the E2E suite creates must be (a) identifiable as synthetic and
 * (b) tied to the run that created it, so cleanup can target exactly — and only
 * — what this run created. No broad deletes, ever.
 *
 * The email domain is `.invalid`, which RFC 2606 reserves as guaranteed
 * non-resolvable: a synthetic account can never receive real mail, so a stray
 * invite or notification cannot reach a real person.
 */

const RUN_ID =
  process.env.E2E_RUN_ID ?? `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const SYNTHETIC_EMAIL_DOMAIN = 'redlined1-e2e-test.invalid';

/** Marker written into name/label fields so synthetic rows are obvious in the UI. */
export const SYNTHETIC_PREFIX = '[E2E]';

export function e2eRunId(): string {
  return RUN_ID;
}

/** e.g. syntheticEmail('owner') → owner-e2e-1754...-a1b2c3@redlined1-e2e-test.invalid */
export function syntheticEmail(label: string): string {
  return `${label}-${RUN_ID}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

export function isSyntheticEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`);
}

/** Names/labels carry both the marker and the run id so cleanup can scope by run. */
export function syntheticName(label: string): string {
  return `${SYNTHETIC_PREFIX} ${label} ${RUN_ID}`;
}

export function isSyntheticName(value: string | null | undefined): boolean {
  return !!value && value.startsWith(SYNTHETIC_PREFIX);
}

/** A password that satisfies the app's minimum without being reused anywhere real. */
export function syntheticPassword(): string {
  return `E2e-${RUN_ID}-Pw1`;
}
