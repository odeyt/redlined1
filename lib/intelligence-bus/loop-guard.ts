/**
 * lib/intelligence-bus/loop-guard.ts
 *
 * Prevents infinite event-derivation loops in the Redline Intelligence Bus.
 *
 * Protection layers:
 *   1. MAX_EVENT_DEPTH hard ceiling — any event with eventDepth > limit is rejected.
 *   2. Causation-chain validation — an event cannot list its own eventId as causationId.
 *   3. Per-correlation event counter — rejects when a single workflow emits too many events.
 *   4. Duplicate derived-event detection — same (eventType, causationId) pair is rejected.
 *
 * Example BLOCKED chain:
 *   diagnostic.dtc.read → vehicle.health.updated → vehicle.health.updated → ...
 *   (depth 0)               (depth 1)                (depth 2, same type loop)
 *
 * Example ALLOWED chain:
 *   diagnostic.session.completed → vehicle.health.updated → failure.predicted
 *   (depth 0)                       (depth 1)                (depth 2, different types)
 */

import { MAX_EVENT_DEPTH } from './event-types';
import type { RibEvent, RibEventType } from './event-types';

export const MAX_EVENTS_PER_CORRELATION = 100;

export class RibLoopError extends Error {
  constructor(
    public readonly reason: 'max_depth' | 'self_causation' | 'correlation_limit' | 'duplicate_derived',
    message: string,
    public readonly eventId: string,
    public readonly correlationId: string,
  ) {
    super(message);
    this.name = 'RibLoopError';
  }
}

interface CorrelationState {
  count: number;
  derivedPairs: Set<string>; // `${eventType}:${causationId}`
}

export class LoopGuard {
  private readonly correlationCounts = new Map<string, CorrelationState>();

  /**
   * Validate an event before dispatch.
   * Throws RibLoopError if any protection rule is violated.
   */
  check(event: RibEvent): void {
    // Rule 1 — depth ceiling
    if (event.eventDepth > MAX_EVENT_DEPTH) {
      throw new RibLoopError(
        'max_depth',
        `Event depth ${event.eventDepth} exceeds maximum ${MAX_EVENT_DEPTH}. ` +
        `Event type: ${event.eventType}, correlation: ${event.correlationId}`,
        event.eventId,
        event.correlationId,
      );
    }

    // Rule 2 — self-causation (an event cannot be its own cause)
    if (event.causationId === event.eventId) {
      throw new RibLoopError(
        'self_causation',
        `Event ${event.eventId} lists itself as causationId.`,
        event.eventId,
        event.correlationId,
      );
    }

    // Rules 3 & 4 — per-correlation tracking
    const state = this.correlationCounts.get(event.correlationId) ?? { count: 0, derivedPairs: new Set() };

    // Rule 3 — correlation event count limit
    if (state.count >= MAX_EVENTS_PER_CORRELATION) {
      throw new RibLoopError(
        'correlation_limit',
        `Correlation ${event.correlationId} has reached the event limit (${MAX_EVENTS_PER_CORRELATION}). ` +
        `Possible runaway chain from event type: ${event.eventType}`,
        event.eventId,
        event.correlationId,
      );
    }

    // Rule 4 — duplicate derived event (same type from same cause, potential direct loop)
    if (event.causationId !== null) {
      const pairKey = `${event.eventType}:${event.causationId}`;
      if (state.derivedPairs.has(pairKey)) {
        throw new RibLoopError(
          'duplicate_derived',
          `Duplicate derived event: type '${event.eventType}' was already derived from causation ` +
          `'${event.causationId}' in correlation '${event.correlationId}'. Direct loop detected.`,
          event.eventId,
          event.correlationId,
        );
      }
      state.derivedPairs.add(pairKey);
    }

    state.count++;
    this.correlationCounts.set(event.correlationId, state);
  }

  /** Clear tracking state for a completed correlation (call when workflow is done) */
  clearCorrelation(correlationId: string): void {
    this.correlationCounts.delete(correlationId);
  }

  /** Clear all state — use in tests only */
  reset(): void {
    this.correlationCounts.clear();
  }

  /** Return current event count for a correlation */
  correlationEventCount(correlationId: string): number {
    return this.correlationCounts.get(correlationId)?.count ?? 0;
  }
}

/** Module-level singleton guard — shared by the bus singleton */
export const loopGuard = new LoopGuard();

// ---------------------------------------------------------------------------
// Loop-guard middleware (for use in the middleware pipeline)
// ---------------------------------------------------------------------------

import type { RibMiddlewareFn } from './middleware/logging';

export const loopGuardMiddleware: RibMiddlewareFn = async (event, next) => {
  loopGuard.check(event); // throws RibLoopError if any rule is violated
  await next();
};

// ---------------------------------------------------------------------------
// Helpers for derived-event publishers
// ---------------------------------------------------------------------------

/**
 * Build the causality fields for a derived event.
 * Call this in any handler that publishes a new event in response to a received one.
 *
 * Usage:
 *   await publish(bus, 'vehicle.health.updated', {
 *     ...derivedFrom(incomingEvent, 'vehicle_health'),
 *     overallScore: 85,
 *     ...
 *   });
 */
export function derivedFrom(
  parent: RibEvent,
  originModule: string,
): Pick<RibEvent, 'correlationId' | 'causationId' | 'eventDepth' | 'originModule' | 'organizationId' | 'shopId'> {
  return {
    correlationId: parent.correlationId,
    causationId: parent.eventId,
    eventDepth: parent.eventDepth + 1,
    originModule,
    organizationId: parent.organizationId,
    shopId: parent.shopId,
  };
}
