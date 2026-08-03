import { alertFailure, alertException, type AlertContext } from './alerts';

/**
 * Billing failures — the cases where money has already moved and the customer
 * has not received what they paid for.
 *
 * Thin wrappers over the generic alert helpers, kept so the webhook's call
 * sites stay explicit about what they are reporting. See ./alerts for why both
 * a log and a Sentry capture happen, and what may go in the context.
 */
export function alertBillingFailure(message: string, context: AlertContext = {}): void {
  alertFailure('billing', message, context);
}

export function alertBillingException(err: unknown, context: AlertContext = {}): void {
  alertException('billing', err, context);
}
