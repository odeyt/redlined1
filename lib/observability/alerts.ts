import * as Sentry from '@sentry/nextjs';

/**
 * Failures that must reach a human.
 *
 * Sentry captures unhandled exceptions on its own. The faults that have
 * actually cost this product were all *caught* errors written with
 * console.error — a rejected webhook signature, a permission-denied write, a
 * provisioning failure the auth callback deliberately swallows. None of them
 * would surface without being reported explicitly.
 *
 * Every alert is logged as well as captured. Vercel logs are the fallback when
 * Sentry is unconfigured or unreachable, and an alert must never depend on a
 * third party to leave any trace at all.
 *
 * Context must stay free of PII: ids, event types, table names and counts are
 * fine; emails, names, card details and raw payloads are not. Sentry is a third
 * party, and these payloads are full of customer data.
 */
export type AlertContext = Record<string, string | number | boolean | null | undefined>;

export function alertFailure(area: string, message: string, context: AlertContext = {}): void {
  console.error(`[${area}] ${message}`, JSON.stringify(context));

  Sentry.captureMessage(`[${area}] ${message}`, {
    level: 'error',
    tags: { area },
    extra: context,
  });
}

/** As above, for a thrown error where the stack is worth keeping. */
export function alertException(area: string, err: unknown, context: AlertContext = {}): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${area}] ${message}`, JSON.stringify(context));

  Sentry.captureException(err instanceof Error ? err : new Error(message), {
    tags: { area },
    extra: context,
  });
}
