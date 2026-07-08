// Fire-and-forget event publisher. Never blocks production. Never throws.
// Uses globalThis.crypto.randomUUID() — works in Node 19+ and modern browsers.
import type { IntelligenceEvent } from '../types';
import type { EventType } from './eventTypes';

const _queue: IntelligenceEvent[] = [];
let _lastEventAt: string | null = null;

export type PublishFn = (event: IntelligenceEvent) => Promise<void>;

let _providerPublish: PublishFn | null = null;

export function setPublishFn(fn: PublishFn): void {
  _providerPublish = fn;
}

export function getQueueSize(): number {
  return _queue.length;
}

export function getLastEventAt(): string | null {
  return _lastEventAt;
}

export function buildEvent(
  eventType: EventType,
  shopId: string,
  userId: string,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown> = {},
  metadata: Record<string, unknown> = {},
): IntelligenceEvent {
  return {
    eventId: globalThis.crypto.randomUUID(),
    eventType,
    shopId,
    userId,
    timestamp: new Date().toISOString(),
    source: 'redlined1',
    entityType,
    entityId,
    payload,
    metadata,
  };
}

/**
 * Publish an event. Fire-and-forget — never throws, never blocks.
 * Returns true if successfully handed off to provider, false otherwise.
 */
export async function publish(event: IntelligenceEvent): Promise<boolean> {
  _queue.push(event);
  try {
    if (_providerPublish) {
      await _providerPublish(event);
    }
    _lastEventAt = event.timestamp;
    _queue.splice(_queue.indexOf(event), 1);
    return true;
  } catch {
    // Intentionally swallowed — intelligence must never affect production
    _queue.splice(_queue.indexOf(event), 1);
    return false;
  }
}

/**
 * Convenience: fire-and-forget without awaiting.
 * Use this in production hooks: void queue(...)
 */
export function queue(
  eventType: EventType,
  shopId: string,
  userId: string,
  entityType: string,
  entityId: string,
  payload?: Record<string, unknown>,
  metadata?: Record<string, unknown>,
): void {
  const event = buildEvent(eventType, shopId, userId, entityType, entityId, payload, metadata);
  void publish(event).catch(() => undefined);
}
