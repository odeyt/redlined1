/**
 * lib/intelligence-bus/bus.ts
 *
 * Redline Intelligence Bus — the central nervous system of RedlineD1.
 *
 * Architecture:
 *   publish(event)
 *     → middleware pipeline (correlation → validation → logging)
 *     → dispatcher fan-out (all subscribed handlers run concurrently)
 *     → persist to rib_events (append-only audit log)
 *
 * V1: in-process synchronous dispatch.
 * Future: swap the dispatcher for a queue-based worker (Trigger.dev / Inngest)
 * without changing any publish() or subscribe() call sites.
 */

import { randomUUID } from 'crypto';
import type { RibEvent, RibEventType } from './event-types';
import type { RibHandler, RibSubscription, RibSubscriberInfo } from './subscriber';
import { RibEventDispatcher, type DispatchResult } from './event-dispatcher';
import { defaultMiddlewarePipeline, type RibMiddlewareFn } from './middleware';

export interface RibPublishResult {
  eventId: string;
  eventType: RibEventType;
  persisted: boolean;
  handlerCount: number;
  errors: Array<{ subscriberId: string; error: string }>;
}

export class RibEventBus {
  private readonly dispatcher = new RibEventDispatcher();
  private readonly middleware: RibMiddlewareFn[] = [...defaultMiddlewarePipeline];
  private readonly stats = new Map<string, RibSubscriberInfo>();
  private persistFn: ((event: RibEvent) => Promise<void>) | null = null;

  /**
   * Attach a persistence function. When set, every event is appended to storage
   * after successful dispatch. Designed to be injected at app startup with a
   * Supabase client, keeping the bus itself free of DB imports.
   */
  setPersistFn(fn: (event: RibEvent) => Promise<void>): void {
    this.persistFn = fn;
  }

  /** Add a middleware to the pipeline (appended after defaults) */
  use(mw: RibMiddlewareFn): void {
    this.middleware.push(mw);
  }

  /**
   * Subscribe a handler to one or more event types.
   * Returns a subscription object whose .unsubscribe() removes the handler.
   */
  subscribe(
    subscriberId: string,
    displayName: string,
    eventTypes: RibEventType[],
    handler: RibHandler,
  ): RibSubscription {
    const subscriptionId = randomUUID();
    const registeredAt = new Date().toISOString();

    this.dispatcher.register(eventTypes, subscriberId, handler);

    if (!this.stats.has(subscriberId)) {
      this.stats.set(subscriberId, {
        subscriberId,
        displayName,
        subscribedEvents: eventTypes,
        isEnabled: true,
        registeredAt,
        lastProcessedAt: null,
        errorCount: 0,
        processedCount: 0,
      });
    }

    const unsubscribe = () => {
      this.dispatcher.unregister(eventTypes, subscriberId);
    };

    return { subscriptionId, subscriberId, eventTypes, registeredAt, unsubscribe };
  }

  /**
   * Publish an event to the bus.
   * Runs the middleware pipeline then fans out to all subscribed handlers.
   */
  async publish(event: RibEvent): Promise<RibPublishResult> {
    let dispatchResult: DispatchResult = {
      eventId: event.eventId,
      eventType: event.eventType,
      handlerCount: 0,
      errors: [],
    };

    const runPipeline = async (index: number): Promise<void> => {
      if (index >= this.middleware.length) {
        // End of middleware — dispatch
        dispatchResult = await this.dispatcher.dispatch(event);
        // Update stats
        for (const [id, info] of this.stats) {
          const wasCalled = dispatchResult.handlerCount > 0;
          if (wasCalled) {
            const hadError = dispatchResult.errors.some((e) => e.subscriberId === id);
            info.processedCount++;
            if (hadError) info.errorCount++;
            info.lastProcessedAt = new Date().toISOString();
          }
        }
        return;
      }
      await this.middleware[index](event, () => runPipeline(index + 1));
    };

    await runPipeline(0);

    // Persist event (append-only audit — never overwrite)
    let persisted = false;
    if (this.persistFn) {
      try {
        await this.persistFn(event);
        persisted = true;
      } catch (err) {
        console.error('[RIB] persistence failed', { eventId: event.eventId, error: String(err) });
      }
    }

    return {
      eventId: event.eventId,
      eventType: event.eventType,
      persisted,
      handlerCount: dispatchResult.handlerCount,
      errors: dispatchResult.errors,
    };
  }

  /** Returns subscriber info for all registered subscribers */
  getSubscriberInfo(): RibSubscriberInfo[] {
    return Array.from(this.stats.values());
  }

  /** Health check — true if bus is operational */
  isHealthy(): boolean {
    return true;
  }
}

/** Singleton bus instance — import this everywhere */
export const intelligenceBus = new RibEventBus();
