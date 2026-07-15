/**
 * lib/intelligence-bus/event-dispatcher.ts
 *
 * Fan-out dispatcher: delivers an event to all registered handlers that match
 * its eventType. Handlers run concurrently with Promise.allSettled so one
 * handler failure never blocks others.
 *
 * Each handler runs with an optional timeout (default 30 s). Timed-out
 * handlers are tracked as errors, not dropped silently.
 */

import type { RibEvent, RibEventType } from './event-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RibHandlerFn<T extends RibEvent = RibEvent> = (event: T) => Promise<void>;

export interface RibSubscriberInfo {
  subscriberId: string;
  eventType: RibEventType;
  handler: RibHandlerFn;
  addedAt: Date;
  version: string;
}

export interface RibSubscription {
  subscriberId: string;
  unsubscribe: () => void;
}

export interface DispatchResult {
  eventId: string;
  eventType: RibEventType;
  handlerCount: number;
  succeededSubscriberIds: string[];
  errors: Array<{ subscriberId: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Timeout helper
// ---------------------------------------------------------------------------

const DEFAULT_HANDLER_TIMEOUT_MS = 30_000;

function withTimeout(p: Promise<void>, ms: number, label: string): Promise<void> {
  return Promise.race([
    p,
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error(`Handler '${label}' timed out after ${ms}ms`)), ms),
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export class RibEventDispatcher {
  private readonly subscribers = new Map<string, RibSubscriberInfo>();
  private nextId = 0;

  subscribe<T extends RibEventType>(
    eventType: T,
    handler: RibHandlerFn<Extract<RibEvent, { eventType: T }>>,
    version = '1',
  ): RibSubscription {
    const subscriberId = `sub_${++this.nextId}`;
    this.subscribers.set(subscriberId, {
      subscriberId,
      eventType,
      handler: handler as RibHandlerFn,
      addedAt: new Date(),
      version,
    });

    return {
      subscriberId,
      unsubscribe: () => { this.subscribers.delete(subscriberId); },
    };
  }

  async dispatch(event: RibEvent, handlerTimeoutMs = DEFAULT_HANDLER_TIMEOUT_MS): Promise<DispatchResult> {
    const matching = Array.from(this.subscribers.values()).filter(
      (s) => s.eventType === event.eventType,
    );

    if (matching.length === 0) {
      return {
        eventId: event.eventId,
        eventType: event.eventType,
        handlerCount: 0,
        succeededSubscriberIds: [],
        errors: [],
      };
    }

    const results = await Promise.allSettled(
      matching.map((s) =>
        withTimeout(s.handler(event), handlerTimeoutMs, s.subscriberId),
      ),
    );

    const succeededSubscriberIds: string[] = [];
    const errors: DispatchResult['errors'] = [];

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        succeededSubscriberIds.push(matching[idx].subscriberId);
      } else {
        errors.push({
          subscriberId: matching[idx].subscriberId,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });

    return {
      eventId: event.eventId,
      eventType: event.eventType,
      handlerCount: matching.length,
      succeededSubscriberIds,
      errors,
    };
  }

  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  getSubscribersForEventType(eventType: RibEventType): RibSubscriberInfo[] {
    return Array.from(this.subscribers.values()).filter((s) => s.eventType === eventType);
  }

  clear(): void {
    this.subscribers.clear();
  }
}
