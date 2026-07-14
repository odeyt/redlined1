/**
 * lib/intelligence-bus/middleware/logging.ts
 *
 * Structured event logging middleware.
 * Logs every RIB event at INFO level with key envelope fields.
 * Errors from downstream handlers are logged at ERROR level.
 */

import type { RibEvent } from '../event-types';

export type RibMiddlewareFn = (event: RibEvent, next: () => Promise<void>) => Promise<void>;

export const loggingMiddleware: RibMiddlewareFn = async (event, next) => {
  const start = Date.now();
  console.log('[RIB]', JSON.stringify({
    level: 'info',
    eventId: event.eventId,
    eventType: event.eventType,
    shopId: event.shopId,
    vehicleId: event.vehicleId,
    diagnosticSessionId: event.diagnosticSessionId,
    correlationId: event.correlationId,
    timestamp: event.timestamp,
  }));

  try {
    await next();
    console.log('[RIB]', JSON.stringify({
      level: 'info',
      eventId: event.eventId,
      eventType: event.eventType,
      status: 'dispatched',
      durationMs: Date.now() - start,
    }));
  } catch (err) {
    console.error('[RIB]', JSON.stringify({
      level: 'error',
      eventId: event.eventId,
      eventType: event.eventType,
      status: 'error',
      error: String(err),
      durationMs: Date.now() - start,
    }));
    throw err;
  }
};
