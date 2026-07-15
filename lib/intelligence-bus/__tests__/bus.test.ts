/**
 * lib/intelligence-bus/__tests__/bus.test.ts
 *
 * Core bus unit tests. Covers:
 *   - Dispatch, event type filtering, error isolation, unsubscribe, middleware
 *   - persist-before-dispatch ordering
 *   - persistFn injected per-publish (no singleton mutation)
 *   - Loop guard rejection propagated in result
 */

import { RibEventBus } from '../bus';
import type { RibEvent } from '../event-types';

function makeEvent(overrides: Partial<RibEvent> = {}): RibEvent {
  return {
    eventId: '00000000-0000-4000-a000-000000000001',
    eventType: 'vehicle.connected',
    schemaVersion: '1.0',
    occurredAt: '2025-01-01T00:00:00Z',
    correlationId: '00000000-0000-4000-a000-000000000002',
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

describe('RibEventBus', () => {
  let bus: RibEventBus;

  beforeEach(() => {
    bus = new RibEventBus();
    bus.resetLoopGuard();
  });

  it('dispatches to a subscribed handler', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    bus.subscribe('vehicle.connected', handler);
    const result = await bus.publish(makeEvent());
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.handlerCount).toBe(1);
    expect(result.handlerErrors).toHaveLength(0);
  });

  it('does not dispatch to handlers for other event types', async () => {
    const dtcHandler = jest.fn().mockResolvedValue(undefined);
    bus.subscribe('diagnostic.dtc.read', dtcHandler);
    await bus.publish(makeEvent({ eventType: 'vehicle.connected' }));
    expect(dtcHandler).not.toHaveBeenCalled();
  });

  it('dispatches to multiple handlers for the same event type', async () => {
    const h1 = jest.fn().mockResolvedValue(undefined);
    const h2 = jest.fn().mockResolvedValue(undefined);
    bus.subscribe('vehicle.connected', h1);
    bus.subscribe('vehicle.connected', h2);
    const result = await bus.publish(makeEvent());
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
    expect(result.handlerCount).toBe(2);
  });

  it('isolates handler errors — other handlers still run', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('boom'));
    const succeeding = jest.fn().mockResolvedValue(undefined);
    bus.subscribe('vehicle.connected', failing);
    bus.subscribe('vehicle.connected', succeeding);
    const result = await bus.publish(makeEvent());
    expect(succeeding).toHaveBeenCalledTimes(1);
    expect(result.handlerErrors).toHaveLength(1);
    expect(result.handlerErrors[0].error).toBe('boom');
  });

  it('stops dispatching after unsubscribe', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const sub = bus.subscribe('vehicle.connected', handler);
    sub.unsubscribe();
    await bus.publish(makeEvent());
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls persistFn BEFORE handler dispatch', async () => {
    const order: string[] = [];
    const persistFn = jest.fn().mockImplementation(async () => { order.push('persist'); });
    const handler = jest.fn().mockImplementation(async () => { order.push('handler'); });
    bus.subscribe('vehicle.connected', handler);
    await bus.publish(makeEvent(), persistFn);
    expect(order).toEqual(['persist', 'handler']);
  });

  it('persists even when no handlers are subscribed', async () => {
    const persistFn = jest.fn().mockResolvedValue(undefined);
    const result = await bus.publish(makeEvent(), persistFn);
    expect(persistFn).toHaveBeenCalledTimes(1);
    expect(result.persisted).toBe(true);
    expect(result.handlerCount).toBe(0);
  });

  it('dispatches even when persistFn throws', async () => {
    const persistFn = jest.fn().mockRejectedValue(new Error('db down'));
    const handler = jest.fn().mockResolvedValue(undefined);
    bus.subscribe('vehicle.connected', handler);
    const result = await bus.publish(makeEvent(), persistFn);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.persisted).toBe(false);
  });

  it('uses separate persistFns across independent publish calls', async () => {
    const persist1 = jest.fn().mockResolvedValue(undefined);
    const persist2 = jest.fn().mockResolvedValue(undefined);
    const e1 = makeEvent({ eventId: '00000000-0000-4000-a000-000000000001', correlationId: '00000000-0000-4000-a000-000000000010' });
    const e2 = makeEvent({ eventId: '00000000-0000-4000-a000-000000000002', correlationId: '00000000-0000-4000-a000-000000000011' });
    await bus.publish(e1, persist1);
    await bus.publish(e2, persist2);
    expect(persist1).toHaveBeenCalledWith(e1);
    expect(persist2).toHaveBeenCalledWith(e2);
  });

  it('returns correct result shape on success', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    bus.subscribe('vehicle.connected', handler);
    const result = await bus.publish(makeEvent(), jest.fn().mockResolvedValue(undefined));
    expect(result.persisted).toBe(true);
    expect(result.handlerCount).toBe(1);
    expect(result.handlerErrors).toHaveLength(0);
    expect(result.loopGuardRejected).toBe(false);
    expect(result.eventType).toBe('vehicle.connected');
  });

  it('rejects an event that exceeds MAX_EVENT_DEPTH', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    bus.subscribe('vehicle.connected', handler);
    const result = await bus.publish(makeEvent({ eventDepth: 11 }));
    expect(handler).not.toHaveBeenCalled();
    expect(result.loopGuardRejected).toBe(true);
    expect(result.persisted).toBe(false);
  });

  it('runs custom middleware before dispatch', async () => {
    const callOrder: string[] = [];
    bus.use(async (event, next) => {
      callOrder.push('middleware');
      await next();
    });
    const handler = jest.fn().mockImplementation(async () => { callOrder.push('handler'); });
    bus.subscribe('vehicle.connected', handler);
    await bus.publish(makeEvent());
    expect(callOrder[0]).toBe('middleware');
    expect(callOrder[callOrder.length - 1]).toBe('handler');
  });

  it('blocks dispatch when middleware throws', async () => {
    bus.use(async () => { throw new Error('blocked'); });
    const handler = jest.fn().mockResolvedValue(undefined);
    bus.subscribe('vehicle.connected', handler);
    const result = await bus.publish(makeEvent());
    expect(handler).not.toHaveBeenCalled();
    expect(result.handlerCount).toBe(0);
  });
});
