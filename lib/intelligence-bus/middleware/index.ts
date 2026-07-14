/**
 * lib/intelligence-bus/middleware/index.ts
 *
 * Default middleware pipeline for the RIB.
 * Order matters: correlation stamps IDs first, validation rejects bad events,
 * logging wraps the entire dispatch for timing.
 */

export { correlationMiddleware } from './correlation';
export { validationMiddleware } from './validation';
export { loggingMiddleware } from './logging';
export type { RibMiddlewareFn } from './logging';

import { correlationMiddleware } from './correlation';
import { validationMiddleware } from './validation';
import { loggingMiddleware } from './logging';
import type { RibMiddlewareFn } from './logging';

/** Default ordered pipeline applied to every event */
export const defaultMiddlewarePipeline: RibMiddlewareFn[] = [
  correlationMiddleware,
  validationMiddleware,
  loggingMiddleware,
];
