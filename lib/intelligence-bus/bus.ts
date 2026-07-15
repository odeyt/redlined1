/**
 * lib/intelligence-bus/bus.ts
 *
 * Core Redline Intelligence Bus (RIB) implementation.
 *
 * Architecture notes:
 * - The bus singleton is module-level and shared within a Node.js process.
 *   Handlers are registered once at process startup (see handlers/index.ts).
 * - The persistFn is passed per-publish call, NOT stored on the singleton.
 *   This avoids the race condition where one request's Supabase client bleeds
 *   into the next request's publish.
 * - Event persist (append to rib_events) happens BEFORE handler dispatch so
 *   the audit trail is complete even when a handler crashes.
 * - Loop guard runs in the middleware pipeline before dispatch.
 */

import { RibEventDispatcher } from './event-dispatcher';
import type { RibSubscription } from './event-dispatcher';
import type { RibEvent, RibEventType } from './event-types';
import { defaultMiddlewarePipeline } from './middleware';
import type { RibMiddlewareFn } from './middleware/logging';
import { loopGuard } from './loop-guard';

export interface RibPublishResult {
  eventId: string;
  eventType: RibEventType;
  persisted: boolean;
  handlerCount: number;
  handlerErrors: Array<{ subscriberId: string; error: string }>;
  loopGuardRejected: boolean;
}

export class RibEventBus {
  private readonly dispatcher = new RibEventDispatcher();
  private readonly middleware: RibMiddlewareFn[] = [...defaultMiddlewarePipeline];

  subscribe<T extends RibEventType>(
    eventType: T,
    handler: (event: Extract<RibEvent, { eventType: T }>) => Promise<void>,
    version = '1',
  ): RibSubscription {
    return this.dispatcher.subscribe(eventType, handler, version);
  }

  use(fn: RibMiddlewareFn): void {
    this.middleware.push(fn);
  }

  /**
   * Publish an event to the bus.
   *
   * Order:
   *   1. Run middleware pipeline (validation → loop guard → payload guard → logging)
   *   2. Persist the event (if persistFn provided) — BEFORE dispatch
   *   3. Dispatch to handlers concurrently via Promise.allSettled
   *
   * persistFn is injected per-call so each request uses its own Supabase client.
   */
  async publish(
    event: RibEvent,
    persistFn?: (event: RibEvent) => Promise<void>,
  ): Promise<RibPublishResult> {
    let dispatchReady = false;

    const runPipeline = async (index: number): Promise<void> => {
      if (index < this.middleware.length) {
        await this.middleware[index](event, () => runPipeline(index + 1));
      } else {
        dispatchReady = true;
      }
    };

    try {
      await runPipeline(0);
    } catch (err) {
      const isGuardError =
        err instanceof Error &&
        (err.name === 'RibLoopError' || err.name === 'RibValidationError' ||
         err.name === 'RibPayloadSizeError' || err.name === 'RibSecretLeakError');
      return {
        eventId: event.eventId,
        eventType: event.eventType,
        persisted: false,
        handlerCount: 0,
        handlerErrors: [],
        loopGuardRejected: isGuardError,
      };
    }

    if (!dispatchReady) {
      return {
        eventId: event.eventId,
        eventType: event.eventType,
        persisted: false,
        handlerCount: 0,
        handlerErrors: [],
        loopGuardRejected: false,
      };
    }

    // Persist BEFORE dispatch — audit trail complete even if handlers crash
    let persisted = false;
    if (persistFn) {
      try {
        await persistFn(event);
        persisted = true;
      } catch {
        // Persist failure is non-fatal: dispatch continues
        // The calling route should log this separately
      }
    }

    const dispatchResult = await this.dispatcher.dispatch(event);

    return {
      eventId: event.eventId,
      eventType: event.eventType,
      persisted,
      handlerCount: dispatchResult.handlerCount,
      handlerErrors: dispatchResult.errors,
      loopGuardRejected: false,
    };
  }

  getSubscriberCount(): number {
    return this.dispatcher.getSubscriberCount();
  }

  resetLoopGuard(): void {
    loopGuard.reset();
  }
}

/** Module-level singleton — handlers registered once at process startup */
export const intelligenceBus = new RibEventBus();
