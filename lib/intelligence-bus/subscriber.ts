/**
 * lib/intelligence-bus/subscriber.ts
 *
 * Handler registration types for the Redline Intelligence Bus.
 * Handlers are async functions that receive a typed RibEvent and return void.
 * Errors thrown by handlers are caught by the dispatcher — one bad handler
 * never kills others.
 */

import type { RibEvent, RibEventType } from './event-types';

/** A handler function for RIB events */
export type RibHandler = (event: RibEvent) => Promise<void>;

/** A typed handler that only fires for specific event types */
export type RibTypedHandler<T extends RibEventType> = (
  event: Extract<RibEvent, { eventType: T }>,
) => Promise<void>;

/** Registration record returned by subscribe() — call unsubscribe() to remove */
export interface RibSubscription {
  subscriptionId: string;
  subscriberId: string;
  eventTypes: RibEventType[];
  registeredAt: string;
  unsubscribe: () => void;
}

/** Metadata about a subscriber (for introspection / health checks) */
export interface RibSubscriberInfo {
  subscriberId: string;
  displayName: string;
  subscribedEvents: RibEventType[];
  isEnabled: boolean;
  registeredAt: string;
  lastProcessedAt: string | null;
  errorCount: number;
  processedCount: number;
}
