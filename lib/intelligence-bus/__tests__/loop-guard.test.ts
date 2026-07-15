/**
 * lib/intelligence-bus/__tests__/loop-guard.test.ts
 *
 * Tests for LoopGuard protection rules:
 *   1. Max depth ceiling
 *   2. Self-causation
 *   3. Per-correlation event count limit
 *   4. Duplicate derived event detection
 */

import { LoopGuard, RibLoopError, MAX_EVENTS_PER_CORRELATION } from '../loop-guard';
import { MAX_EVENT_DEPTH } from '../event-types';
import type { RibEvent } from '../event-types';

function makeEvent(overrides: Partial<RibEvent> = {}): RibEvent {
  return {
    eventId: '00000000-0000-4000-a000-000000000001',
    eventType: 'vehicle.connected',
    schemaVersion: '1.0',
    occurredAt: '2025-01-01T00:00:00Z',
    correlationId: 'corr-0000-0000-0000-000000000001',
    causationId: null,
    eventDepth: 0,
    originModule: 'test',
    organizationId: '00000000-0000-4000-a000-000000000003',
    shopId: '00000000-0000-4000-a000-000000000004',
    technicianId: null,
    vehicleId: null,
    diagnosticSessionId: null,
    vin: null,
    hardwareType: 'elm327',
    bridgeDeviceId: null,
    protocolDetected: null,
    ...overrides,
  } as RibEvent;
}

describe('LoopGuard', () => {
  let guard: LoopGuard;

  beforeEach(() => {
    guard = new LoopGuard();
  });

  // -- Rule 1: Max depth --

  it('allows an event at exactly MAX_EVENT_DEPTH', () => {
    expect(() => guard.check(makeEvent({ eventDepth: MAX_EVENT_DEPTH }))).not.toThrow();
  });

  it('rejects an event exceeding MAX_EVENT_DEPTH', () => {
    expect(() => guard.check(makeEvent({ eventDepth: MAX_EVENT_DEPTH + 1 }))).toThrow(RibLoopError);
  });

  it('RibLoopError has reason max_depth when depth exceeded', () => {
    try {
      guard.check(makeEvent({ eventDepth: MAX_EVENT_DEPTH + 1 }));
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RibLoopError);
      expect((err as RibLoopError).reason).toBe('max_depth');
    }
  });

  // -- Rule 2: Self-causation --

  it('rejects an event that lists itself as causationId', () => {
    const id = '00000000-0000-4000-a000-000000000001';
    expect(() => guard.check(makeEvent({ eventId: id, causationId: id }))).toThrow(RibLoopError);
  });

  it('RibLoopError has reason self_causation', () => {
    const id = '00000000-0000-4000-a000-000000000001';
    try {
      guard.check(makeEvent({ eventId: id, causationId: id }));
    } catch (err) {
      expect((err as RibLoopError).reason).toBe('self_causation');
    }
  });

  // -- Rule 3: Correlation limit --

  it('allows up to MAX_EVENTS_PER_CORRELATION events', () => {
    const corrId = 'corr-limit-test-0001';
    for (let i = 0; i < MAX_EVENTS_PER_CORRELATION; i++) {
      expect(() =>
        guard.check(makeEvent({ eventId: `00000000-0000-4000-a000-${String(i).padStart(12, '0')}`, correlationId: corrId }))
      ).not.toThrow();
    }
  });

  it('rejects the (N+1)th event in a correlation', () => {
    const corrId = 'corr-limit-test-0002';
    for (let i = 0; i < MAX_EVENTS_PER_CORRELATION; i++) {
      guard.check(makeEvent({ eventId: `00000000-0000-4000-a000-${String(i).padStart(12, '0')}`, correlationId: corrId }));
    }
    expect(() => guard.check(makeEvent({ correlationId: corrId }))).toThrow(RibLoopError);
  });

  it('RibLoopError has reason correlation_limit', () => {
    const corrId = 'corr-limit-test-0003';
    for (let i = 0; i < MAX_EVENTS_PER_CORRELATION; i++) {
      guard.check(makeEvent({ eventId: `00000000-0000-4000-a000-${String(i).padStart(12, '0')}`, correlationId: corrId }));
    }
    try {
      guard.check(makeEvent({ correlationId: corrId }));
    } catch (err) {
      expect((err as RibLoopError).reason).toBe('correlation_limit');
    }
  });

  // -- Rule 4: Duplicate derived event --

  it('rejects the same (eventType, causationId) pair twice in a correlation', () => {
    const corrId = 'corr-dup-test-0001';
    const parentId = '00000000-0000-4000-a000-000000000099';
    guard.check(makeEvent({
      eventId: '00000000-0000-4000-a000-000000000001',
      correlationId: corrId,
      causationId: parentId,
      eventType: 'vehicle.health.updated',
    } as Partial<RibEvent>));
    expect(() => guard.check(makeEvent({
      eventId: '00000000-0000-4000-a000-000000000002',
      correlationId: corrId,
      causationId: parentId,
      eventType: 'vehicle.health.updated',
    } as Partial<RibEvent>))).toThrow(RibLoopError);
  });

  it('allows the same eventType from different causationIds', () => {
    const corrId = 'corr-dup-test-0002';
    guard.check(makeEvent({
      eventId: '00000000-0000-4000-a000-000000000001',
      correlationId: corrId,
      causationId: '00000000-0000-4000-a000-000000000010',
      eventType: 'vehicle.health.updated',
    } as Partial<RibEvent>));
    expect(() => guard.check(makeEvent({
      eventId: '00000000-0000-4000-a000-000000000002',
      correlationId: corrId,
      causationId: '00000000-0000-4000-a000-000000000011', // different parent
      eventType: 'vehicle.health.updated',
    } as Partial<RibEvent>))).not.toThrow();
  });

  it('allows different event types from the same causationId', () => {
    const corrId = 'corr-dup-test-0003';
    const parentId = '00000000-0000-4000-a000-000000000099';
    guard.check(makeEvent({
      eventId: '00000000-0000-4000-a000-000000000001',
      correlationId: corrId,
      causationId: parentId,
      eventType: 'vehicle.health.updated',
    } as Partial<RibEvent>));
    expect(() => guard.check(makeEvent({
      eventId: '00000000-0000-4000-a000-000000000002',
      correlationId: corrId,
      causationId: parentId,
      eventType: 'failure.predicted',
    } as Partial<RibEvent>))).not.toThrow();
  });

  // -- clearCorrelation / reset --

  it('clearCorrelation allows new events for that correlation', () => {
    const corrId = 'corr-clear-test-0001';
    for (let i = 0; i < MAX_EVENTS_PER_CORRELATION; i++) {
      guard.check(makeEvent({ eventId: `00000000-0000-4000-a000-${String(i).padStart(12, '0')}`, correlationId: corrId }));
    }
    guard.clearCorrelation(corrId);
    expect(() => guard.check(makeEvent({ correlationId: corrId }))).not.toThrow();
  });

  it('reset clears all correlation state', () => {
    const corrId = 'corr-reset-test-0001';
    for (let i = 0; i < MAX_EVENTS_PER_CORRELATION; i++) {
      guard.check(makeEvent({ eventId: `00000000-0000-4000-a000-${String(i).padStart(12, '0')}`, correlationId: corrId }));
    }
    guard.reset();
    expect(guard.correlationEventCount(corrId)).toBe(0);
    expect(() => guard.check(makeEvent({ correlationId: corrId }))).not.toThrow();
  });
});
