import * as Sentry from '@sentry/nextjs';

/**
 * Billing failures that must reach a human.
 *
 * Sentry captures unhandled exceptions. Every billing fault found on
 * 2026-08-02 was a caught error written with console.error — a rejected
 * webhook signature, an unresolvable shop, a permission-denied write — so all
 * of them would have stayed invisible even with Sentry configured. The endpoint
 * answered 200, Creem considered the event handled, and the customer was
 * charged for nothing.
 *
 * These are the cases where money has already moved and the customer has not
 * received what they paid for. They are not "warnings" in any useful sense:
 * every one needs somebody to look.
 *
 * Context must stay free of PII. Ids, event types, table names and counts are
 * fine; email addresses, names, card details and raw payloads are not — Sentry
 * is a third-party service, and a billing payload is full of customer data.
 */
export function alertBillingFailure(
  message: string,
  context: Record<string, string | number | boolean | null | undefined> = {},
): void {
  // Logged as well as captured: Vercel logs are the fallback when Sentry is
  // unconfigured (no DSN) or unreachable, and this must never depend on a
  // third party to leave a trace.
  console.error(`[billing] ${message}`, JSON.stringify(context));

  Sentry.captureMessage(`[billing] ${message}`, {
    level: 'error',
    tags: { area: 'billing' },
    extra: context,
  });
}

/** As above, for a thrown error where the stack is worth keeping. */
export function alertBillingException(
  err: unknown,
  context: Record<string, string | number | boolean | null | undefined> = {},
): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[billing] ${message}`, JSON.stringify(context));

  Sentry.captureException(err instanceof Error ? err : new Error(message), {
    tags: { area: 'billing' },
    extra: context,
  });
}
