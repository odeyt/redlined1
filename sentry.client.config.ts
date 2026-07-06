import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// Only initialize when DSN is set — no-op in development without DSN
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? 'development',

    // Capture 10% of transactions for performance monitoring (free tier friendly)
    tracesSampleRate: process.env.NEXT_PUBLIC_APP_ENV === 'production' ? 0.1 : 0,

    // Replay 1% of sessions; 100% of sessions with errors
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: process.env.NEXT_PUBLIC_APP_ENV === 'production' ? 1.0 : 0,

    // Suppress noisy network errors
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error exception captured',
      'Network request failed',
      /^Loading chunk \d+ failed/,
    ],

    beforeSend(event) {
      // Strip any PII that slipped through — never send customer data to Sentry
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
        delete event.user.ip_address;
      }
      return event;
    },
  });
}
