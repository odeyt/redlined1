/**
 * Billing alerts must reach BOTH the log and Sentry.
 *
 * Sentry only captures unhandled exceptions on its own. Every billing fault
 * found on 2026-08-02 was a caught error written with console.error, so
 * configuring Sentry alone would not have surfaced a single one of them.
 *
 * The log half matters just as much: it is the fallback when no DSN is set or
 * Sentry is unreachable, and an alert must never depend on a third party to
 * leave any trace at all.
 */
jest.mock('@sentry/nextjs', () => ({
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));

import * as Sentry from '@sentry/nextjs';
import { alertBillingFailure, alertBillingException } from '../observability/billingAlerts';

describe('alertBillingFailure', () => {
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it('writes to the log, so a missing DSN still leaves a trace', () => {
    alertBillingFailure('activation failed', { eventType: 'checkout.completed' });
    expect(consoleError).toHaveBeenCalled();
  });

  it('also reports to Sentry, which console.error alone never does', () => {
    alertBillingFailure('activation failed', { eventType: 'checkout.completed' });
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      '[billing] activation failed',
      expect.objectContaining({ level: 'error', tags: { area: 'billing' } }),
    );
  });

  it('carries the context through for diagnosis', () => {
    alertBillingFailure('cannot resolve a shop', { providerEventId: 'evt_1', hasUserId: false });
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ extra: { providerEventId: 'evt_1', hasUserId: false } }),
    );
  });
});

describe('alertBillingException', () => {
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it('preserves the original Error so the stack survives', () => {
    const err = new Error('permission denied for table billing_events');
    alertBillingException(err, { stage: 'activation' });
    expect(Sentry.captureException).toHaveBeenCalledWith(err, expect.anything());
  });

  it('wraps a non-Error throw rather than dropping it', () => {
    alertBillingException('string failure', { stage: 'activation' });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'string failure' }),
      expect.anything(),
    );
  });

  it('logs as well, for the same reason as above', () => {
    alertBillingException(new Error('boom'));
    expect(consoleError).toHaveBeenCalled();
  });
});
