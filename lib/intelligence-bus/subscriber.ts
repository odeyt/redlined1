/**
 * lib/intelligence-bus/subscriber.ts
 *
 * Handler registration types for the Redline Intelligence Bus.
 * RibSubscription and RibSubscriberInfo are now defined in event-dispatcher.ts
 * and re-exported here for backward compatibility with existing handler imports.
 */

import type { RibEvent, RibEventType } from './event-types';

export type RibHandler = (event: RibEvent) => Promise<void>;

export type RibTypedHandler<T extends RibEventType> = (
  event: Extract<RibEvent, { eventType: T }>,
) => Promise<void>;

// Re-export from the canonical source so all handler files that import
// `RibSubscription from '../subscriber'` still compile.
export type { RibSubscription, RibSubscriberInfo } from './event-dispatcher';
