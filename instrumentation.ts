import * as Sentry from '@sentry/nextjs';

export async function register() {
  // Only load Sentry server config in Node.js runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Required from Next.js 15 onward: errors thrown inside server components,
// route handlers and server actions are caught by the framework and never
// reach a global handler, so without this hook Sentry sees none of them.
// The Sentry config files alone are not enough.
export const onRequestError = Sentry.captureRequestError;
