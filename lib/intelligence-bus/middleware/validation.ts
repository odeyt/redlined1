/**
 * lib/intelligence-bus/middleware/validation.ts
 *
 * Zod validation middleware — rejects malformed events before they reach handlers.
 * Throws RibValidationError so the publisher can return a typed error to the caller.
 */

import { RibEventSchema } from '../schemas';
import type { RibEvent } from '../event-types';
import type { RibMiddlewareFn } from './logging';

export class RibValidationError extends Error {
  constructor(
    public readonly eventType: string,
    public readonly issues: unknown,
  ) {
    super(`RIB validation failed for event type "${eventType}"`);
    this.name = 'RibValidationError';
  }
}

export const validationMiddleware: RibMiddlewareFn = async (event, next) => {
  const result = RibEventSchema.safeParse(event);
  if (!result.success) {
    throw new RibValidationError(event.eventType, result.error.flatten());
  }
  await next();
};
