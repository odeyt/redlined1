/**
 * lib/intelligence-bus/publisher.ts
 *
 * Type-safe publish helper.
 * Builds the required envelope fields automatically so callers only need to
 * provide the event-specific payload plus the required context fields.
 *
 * Usage:
 *   await publish(intelligenceBus, 'diagnostic.dtc.read', {
 *     organizationId, shopId, vehicleId, diagnosticSessionId,
 *     technicianId: null, correlationId,
 *     dtcCode: 'P0420', ...
 *   });
 */

import { randomUUID } from 'crypto';
import type { RibEventBus } from './bus';
import type { RibEvent, RibEventType, RibEventOfType } from './event-types';

type OmitEnvelope = 'eventId' | 'timestamp' | 'schemaVersion' | 'eventType';

/** Publish a typed event. eventId and timestamp are auto-generated. */
export async function publish<T extends RibEventType>(
  bus: RibEventBus,
  eventType: T,
  fields: Omit<RibEventOfType<T>, OmitEnvelope>,
) {
  const event: RibEvent = {
    ...fields,
    eventType,
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    schemaVersion: '1.0',
  } as unknown as RibEvent;

  return bus.publish(event);
}

/**
 * Build a factory bound to a fixed bus, organizationId, and shopId.
 * Useful inside API route handlers where the context is constant.
 */
export function createPublisher(
  bus: RibEventBus,
  organizationId: string,
  shopId: string,
) {
  return async function publishEvent<T extends RibEventType>(
    eventType: T,
    fields: Omit<RibEventOfType<T>, OmitEnvelope | 'organizationId' | 'shopId' | 'eventType'>,
  ) {
    return publish(bus, eventType, {
      organizationId,
      shopId,
      ...fields,
    } as Omit<RibEventOfType<T>, OmitEnvelope>);
  };
}
