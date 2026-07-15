/**
 * lib/intelligence-bus/publisher.ts
 *
 * Typed publish helpers for the Redline Intelligence Bus.
 * Callers provide only the domain-specific fields; envelope fields are auto-generated.
 */

import { randomUUID } from 'crypto';
import { RIB_SCHEMA_VERSION } from './event-types';
import type { RibEvent, RibEventType, RibEventOfType } from './event-types';
import type { RibEventBus, RibPublishResult } from './bus';

// ---------------------------------------------------------------------------
// Envelope fields that publish() fills in automatically
// ---------------------------------------------------------------------------

type OmitEnvelope =
  | 'eventId'
  | 'occurredAt'
  | 'schemaVersion'
  | 'eventType'
  | 'eventDepth'
  | 'causationId';

// ---------------------------------------------------------------------------
// Core publish function
// ---------------------------------------------------------------------------

/**
 * Publish a typed event to the bus.
 *
 * Auto-generated envelope fields:
 *   eventId, occurredAt, schemaVersion, eventDepth (0), causationId (null)
 *
 * For derived events use derivedFrom() from loop-guard.ts and spread its result:
 *   await publish(bus, 'vehicle.health.updated', {
 *     ...derivedFrom(incomingEvent, 'vehicle_health'),
 *     overallScore: 85, ...
 *   });
 */
export async function publish<T extends RibEventType>(
  bus: RibEventBus,
  eventType: T,
  fields: Omit<RibEventOfType<T>, OmitEnvelope> & Partial<Pick<RibEventOfType<T>, 'eventDepth' | 'causationId'>>,
  persistFn?: (event: RibEvent) => Promise<void>,
): Promise<RibPublishResult> {
  const now = new Date().toISOString();

  const event = {
    ...fields,
    eventId: randomUUID(),
    eventType,
    schemaVersion: RIB_SCHEMA_VERSION,
    occurredAt: now,
    eventDepth: (fields as { eventDepth?: number }).eventDepth ?? 0,
    causationId: (fields as { causationId?: string | null }).causationId ?? null,
  } as RibEventOfType<T>;

  return bus.publish(event as RibEvent, persistFn);
}

// ---------------------------------------------------------------------------
// Publisher factory — pre-binds tenant context
// ---------------------------------------------------------------------------

/**
 * Returns a publish function pre-bound to a specific organization, shop, and module.
 *
 * Usage:
 *   const emit = createPublisher(bus, orgId, shopId, 'vehicle_health');
 *   await emit('vehicle.health.updated', { overallScore: 85, ... });
 */
export function createPublisher(
  bus: RibEventBus,
  organizationId: string,
  shopId: string,
  originModule: string,
  persistFn?: (event: RibEvent) => Promise<void>,
) {
  return function emit<T extends RibEventType>(
    eventType: T,
    fields: Omit<
      RibEventOfType<T>,
      OmitEnvelope | 'organizationId' | 'shopId' | 'originModule'
    > & Partial<Pick<RibEventOfType<T>, 'eventDepth' | 'causationId'>>,
  ): Promise<RibPublishResult> {
    return publish(
      bus,
      eventType,
      { ...fields, organizationId, shopId, originModule } as Parameters<typeof publish<T>>[2],
      persistFn,
    );
  };
}
