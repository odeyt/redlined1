// Production-ready logging utility.
// In development: logs to console.
// In production: logs to console (Sentry hook point ready — search for SENTRY_HOOK).
// To add Sentry: npm install @sentry/nextjs, then uncomment the SENTRY_HOOK lines.

const isDev = process.env.NODE_ENV !== 'production';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  module?: string;
  userId?: string;
  shopId?: string;
  [key: string]: unknown;
}

function format(level: LogLevel, message: string, context?: LogContext): string {
  const ts = new Date().toISOString();
  const ctx = context ? ` ${JSON.stringify(context)}` : '';
  return `[${ts}] [${level.toUpperCase()}]${ctx} ${message}`;
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
    // SENTRY_HOOK: Sentry.captureMessage(message, { level: 'warning', extra: context });
  },

  error(message: string, error?: unknown, context?: LogContext) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(format('error', message, context), err);
    // SENTRY_HOOK: Sentry.captureException(err, { extra: { message, ...context } });
  },
};
