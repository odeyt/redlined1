/**
 * lib/intelligence-bus/middleware/index.ts
 *
 * Default middleware pipeline for the RIB.
 * Order: correlation → validation → loop guard → payload guard → logging
 *
 * Loop guard runs AFTER validation so the event envelope is known-good before
 * checking depth/causation constraints.
 * Payload guard runs before logging so oversized events don't fill logs.
 */

export { correlationMiddleware } from './correlation';
export { validationMiddleware } from './validation';
export { loggingMiddleware } from './logging';
export type { RibMiddlewareFn } from './logging';

import { correlationMiddleware } from './correlation';
import { validationMiddleware } from './validation';
import { loggingMiddleware } from './logging';
import { loopGuardMiddleware } from '../loop-guard';
import { payloadGuardMiddleware } from '../payload-guard';
import type { RibMiddlewareFn } from './logging';

export const defaultMiddlewarePipeline: RibMiddlewareFn[] = [
  correlationMiddleware,
  validationMiddleware,
  loopGuardMiddleware,
  payloadGuardMiddleware,
  loggingMiddleware,
];
