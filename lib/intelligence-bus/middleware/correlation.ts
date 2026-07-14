/**
 * lib/intelligence-bus/middleware/correlation.ts
 *
 * Correlation ID middleware.
 * Ensures every event has a correlationId. If one was not set by the publisher,
 * a new one is generated and stamped onto the event before dispatch.
 * This enables tracing chains of events across handlers.
 */

import { randomUUID } from 'crypto';
import type { RibEvent } from '../event-types';
import type { RibMiddlewareFn } from './logging';

export const correlationMiddleware: RibMiddlewareFn = async (event, next) => {
  if (!event.correlationId) {
    (event as RibEvent & { correlationId: string }).correlationId = randomUUID();
  }
  await next();
};
