// Production-ready logging utility with Sentry integration.
// Sentry is activated only when SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN is set.
// If Sentry is not configured the app continues normally — observability never crashes prod.

const isDev = process.env.NODE_ENV !== 'production';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  module?: string;
  userId?: string;
  shopId?: string;
  componentStack?: string;
  [key: string]: unknown;
}

function format(level: LogLevel, message: string, context?: LogContext): string {
  const ts = new Date().toISOString();
  const ctx = context ? ` ${JSON.stringify(context)}` : '';
  return `[${ts}] [${level.toUpperCase()}]${ctx} ${message}`;
}

function sentryDsn(): string {
  return (
    (typeof window !== 'undefined'
      ? process.env.NEXT_PUBLIC_SENTRY_DSN
      : process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN) ?? ''
  );
}

function captureToSentry(type: 'exception' | 'message', payload: unknown, level: 'info' | 'warning' | 'error', extra?: Record<string, unknown>): void {
  if (!sentryDsn()) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/nextjs');
    if (type === 'exception') {
      Sentry.captureException(payload, { extra });
    } else {
      Sentry.captureMessage(payload as string, { level, extra });
    }
  } catch { /* never crash because of observability */ }
}

export const logger = {
  debug(message: string, context?: LogContext) {
    if (!isDev) return;
    console.debug(format('debug', message, context));
  },

  info(message: string, context?: LogContext) {
    console.info(format('info', message, context));
  },

  warn(message: string, context?: LogContext) {
    console.warn(format('warn', message, context));
    captureToSentry('message', message, 'warning', context as Record<string, unknown>);
  },

  error(message: string, error?: unknown, context?: LogContext) {
    const err = error instanceof Error ? error : new Error(String(error ?? message));
    console.error(format('error', message, context), err);
    captureToSentry('exception', err, 'error', {
      message,
      ...(context as Record<string, unknown>),
    });
  },
};
