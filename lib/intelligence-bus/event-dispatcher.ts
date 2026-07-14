/**
 * lib/intelligence-bus/event-dispatcher.ts
 *
 * Fans a validated RibEvent out to all registered handlers for its event type.
 * Handler errors are isolated — one failure logs and continues; it never
 * prevents other handlers from receiving the event.
 */

import type { RibEvent, RibEventType } from './event-types';
import type { RibHandler } from './subscriber';

export interface DispatchResult {
  eventId: string;
  eventType: RibEventType;
  handlerCount: number;
  errors: Array<{ subscriberId: string; error: string }>;
}

export class RibEventDispatcher {
  private readonly handlers = new Map<RibEventType, Map<string, RibHandler>>();

  register(eventTypes: RibEventType[], subscriberId: string, handler: RibHandler): void {
    for (const eventType of eventTypes) {
      if (!this.handlers.has(eventType)) {
        this.handlers.set(eventType, new Map());
      }
      this.handlers.get(eventType)!.set(subscriberId, handler);
    }
  }

  unregister(eventTypes: RibEventType[], subscriberId: string): void {
    for (const eventType of eventTypes) {
      this.handlers.get(eventType)?.delete(subscriberId);
    }
  }

  async dispatch(event: RibEvent): Promise<DispatchResult> {
    const handlerMap = this.handlers.get(event.eventType);
    const errors: Array<{ subscriberId: string; error: string }> = [];

    if (!handlerMap?.size) {
      return { eventId: event.eventId, eventType: event.eventType, handlerCount: 0, errors };
    }

    // Run all handlers concurrently, isolate failures
    const settlements = await Promise.allSettled(
      Array.from(handlerMap.entries()).map(([subscriberId, handler]) =>
        handler(event).catch((err) => {
          throw Object.assign(err, { subscriberId });
        }),
      ),
    );

    for (const result of settlements) {
      if (result.status === 'rejected') {
        const err = result.reason as Error & { subscriberId?: string };
        errors.push({
          subscriberId: err.subscriberId ?? 'unknown',
          error: err.message ?? String(result.reason),
        });
        console.error('[RIB dispatcher] handler error', {
          eventId: event.eventId,
          eventType: event.eventType,
          subscriberId: err.subscriberId,
          error: err.message,
        });
      }
    }

    return { eventId: event.eventId, eventType: event.eventType, handlerCount: handlerMap.size, errors };
  }

  subscriberCount(eventType: RibEventType): number {
    return this.handlers.get(eventType)?.size ?? 0;
  }

  allSubscriberIds(): string[] {
    const ids = new Set<string>();
    for (const map of this.handlers.values()) {
      for (const id of map.keys()) ids.add(id);
    }
    return Array.from(ids);
  }
}
