/**
 * lib/intelligence-bus/middleware/correlation.ts
 *
 * Correlation middleware — ensures every event has a correlationId.
 * For root events (no causationId) a new UUID is minted if one wasn't provided.
 * For derived events the correlationId should already be set by the caller via derivedFrom().
 */

import { randomUUID } from 'crypto';
import type { RibMiddlewareFn } from './logging';

export const correlationMiddleware: RibMiddlewareFn = async (event, next) => {
  if (!event.correlationId) {
    (event as { correlationId: string }).correlationId = randomUUID();
  }
  await next();
};
