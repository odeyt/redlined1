/**
 * lib/intelligence-bus/middleware/logging.ts
 *
 * Structured event logging middleware.
 * Logs causality envelope fields (depth, causationId, originModule) alongside
 * the existing event identifiers.
 */

import type { RibEvent } from '../event-types';

export type RibMiddlewareFn = (event: RibEvent, next: () => Promise<void>) => Promise<void>;

export const loggingMiddleware: RibMiddlewareFn = async (event, next) => {
  const start = Date.now();
  console.log('[RIB]', JSON.stringify({
    level: 'info',
    action: 'publish',
    eventId: event.eventId,
    eventType: event.eventType,
    shopId: event.shopId,
    vehicleId: event.vehicleId,
    correlationId: event.correlationId,
    causationId: event.causationId,
    eventDepth: event.eventDepth,
    originModule: event.originModule,
  }));

  try {
    await next();
    console.log('[RIB]', JSON.stringify({
      level: 'info',
      action: 'dispatched',
      eventId: event.eventId,
      eventType: event.eventType,
      durationMs: Date.now() - start,
    }));
  } catch (err) {
    console.error('[RIB]', JSON.stringify({
      level: 'error',
      action: 'dispatch_failed',
      eventId: event.eventId,
      eventType: event.eventType,
      error: err instanceof Error ? err.message : String(err),
      errorName: err instanceof Error ? err.name : 'unknown',
      durationMs: Date.now() - start,
    }));
    throw err;
  }
};
