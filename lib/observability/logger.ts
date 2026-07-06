/**
 * Extended observability logger — wraps the base lib/logger with structured
 * event methods for API errors, user actions, feature flag events, and metrics.
 *
 * Uses the base logger for console output.
 * Sends to Sentry when SENTRY_DSN is configured.
 * Never crashes the app if observability fails.
 */

import { logger } from '@/lib/logger';
import type { LogContext } from '@/lib/logger';

// ── Sentry capture helper ─────────────────────────────────────────────────────
// Dynamic require so the app never crashes if Sentry isn't configured.

function captureSentryError(error: Error, context?: Record<string, unknown>): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/nextjs');
    Sentry.captureException(error, { extra: context });
  } catch { /* never crash because of observability */ }
}

function captureSentryMessage(message: string, level: 'info' | 'warning' | 'error', context?: Record<string, unknown>): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/nextjs');
    Sentry.captureMessage(message, { level, extra: context });
  } catch { /* never crash because of observability */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function logInfo(message: string, context?: LogContext): void {
  logger.info(message, context);
}

export function logWarn(message: string, context?: LogContext): void {
  logger.warn(message, context);
  captureSentryMessage(message, 'warning', context as Record<string, unknown>);
}

export function logError(message: string, error?: unknown, context?: LogContext): void {
  logger.error(message, error, context);
  const err = error instanceof Error ? error : new Error(String(error ?? message));
  captureSentryError(err, context as Record<string, unknown>);
}

export interface ApiErrorContext extends Record<string, unknown> {
  route: string;
  method: string;
  statusCode: number;
  durationMs?: number;
  userId?: string;
  shopId?: string;
  errorMessage?: string;
}

export function logApiError(ctx: ApiErrorContext): void {
  logger.error(`API ${ctx.method} ${ctx.route} → ${ctx.statusCode}`, undefined, {
    module: 'api',
    ...ctx,
  });
  captureSentryMessage(
    `API error: ${ctx.method} ${ctx.route} ${ctx.statusCode}`,
    'error',
    ctx,
  );
}

export interface UserActionContext {
  action: string;
  userId?: string;
  shopId?: string;
  module?: string;
  metadata?: Record<string, unknown>;
}

export function logUserAction(ctx: UserActionContext): void {
  logger.info(`User action: ${ctx.action}`, {
    module: ctx.module ?? 'app',
    userId: ctx.userId,
    shopId: ctx.shopId,
    ...ctx.metadata,
  });
}

export interface FlagEventContext extends Record<string, unknown> {
  flagKey: string;
  oldValue: boolean;
  newValue: boolean;
  scope: string;
  userId?: string;
  shopId?: string;
  environment?: string;
}

export function logFeatureFlagEvent(ctx: FlagEventContext): void {
  logger.info(`Feature flag ${ctx.flagKey}: ${ctx.oldValue} → ${ctx.newValue}`, {
    module: 'feature-flags',
    ...ctx,
  });
  captureSentryMessage(`Flag toggled: ${ctx.flagKey}`, 'info', ctx);
}

export interface PerformanceMetric {
  name: string;
  durationMs?: number;
  value?: number;
  unit?: string;
  userId?: string;
  shopId?: string;
  metadata?: Record<string, unknown>;
}

export function logPerformanceMetric(metric: PerformanceMetric): void {
  logger.info(`Metric: ${metric.name} = ${metric.value ?? metric.durationMs}${metric.unit ?? 'ms'}`, {
    module: 'performance',
    ...metric.metadata,
  });
}

// Re-export base logger methods for convenience
export { logger };
