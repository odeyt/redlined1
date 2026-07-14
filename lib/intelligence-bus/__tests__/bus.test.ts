/**
 * lib/intelligence-bus/__tests__/bus.test.ts
 *
 * Unit tests for RibEventBus.
 * Tests: subscribe, publish, handler isolation, unsubscribe, stats.
 */

import { RibEventBus } from '../bus';
import type { RibEvent } from '../event-types';
import type { RibMiddlewareFn } from '../middleware';

function makeEvent(overrides: Partial<RibEvent> = {}): RibEvent {
  return {
    eventId: '00000000-0000-0000-0000-000000000001',
    eventType: 'diagnostic.dtc.read',
    timestamp: '2025-01-01T00:00:00.000Z',
    organizationId: 'org-1',
    shopId: '00000000-0000-0000-0000-000000000002',
    technicianId: null,
    vehicleId: null,
    diagnosticSessionId: null,
    correlationId: 'corr-1',
    schemaVersion: '1.0',
    dtcCode: 'P0420',
    description: null,
    system: null,
    moduleId: null,
    isPending: false,
    isPermanent: true,
    odometerKm: null,
    ...overrides,
  } as unknown as RibEvent;
}

describe('RibEventBus', () => {
  let bus: RibEventBus;

  beforeEach(() => {
    bus = new RibEventBus();
    // Remove default middleware for unit tests
    (bus as unknown as { middleware: RibMiddlewareFn[] }).middleware = [];
  });

  it('dispatches event to a subscribed handler', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    bus.subscribe('sub1', 'Test Subscriber', ['diagnostic.dtc.read'], handler);

    const event = makeEvent();
    const result = await bus.publish(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
    expect(result.handlerCount).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('does not dispatch to handlers for other event types', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    bus.subscribe('sub1', 'Test', ['repair.verified'], handler);

    await bus.publish(makeEvent({ eventType: 'diagnostic.dtc.read' }));

    expect(handler).not.toHaveBeenCalled();
  });

  it('isolates handler errors — other handlers still run', async () => {
    const failingHandler = jest.fn().mockRejectedValue(new Error('handler boom'));
    const goodHandler = jest.fn().mockResolvedValue(undefined);

    bus.subscribe('bad', 'Bad Handler', ['diagnostic.dtc.read'], failingHandler);
    bus.subscribe('good', 'Good Handler', ['diagnostic.dtc.read'], goodHandler);

    const result = await bus.publish(makeEvent());

    expect(goodHandler).toHaveBeenCalledTimes(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toBe('handler boom');
  });

  it('unsubscribe removes handler from future dispatches', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const sub = bus.subscribe('sub1', 'Test', ['diagnostic.dtc.read'], handler);

    sub.unsubscribe();
    await bus.publish(makeEvent());

    expect(handler).not.toHaveBeenCalled();
  });

  it('calls persistence function when set', async () => {
    const persistFn = jest.fn().mockResolvedValue(undefined);
    bus.setPersistFn(persistFn);

    const event = makeEvent();
    const result = await bus.publish(event);

    expect(persistFn).toHaveBeenCalledWith(event);
    expect(result.persisted).toBe(true);
  });

  it('reports persisted=false when persistence throws', async () => {
    bus.setPersistFn(jest.fn().mockRejectedValue(new Error('db down')));
    const result = await bus.publish(makeEvent());
    expect(result.persisted).toBe(false);
  });

  it('executes middleware in order before dispatching', async () => {
    const order: string[] = [];
    const mw1: RibMiddlewareFn = async (_e, next) => { order.push('mw1'); await next(); };
    const mw2: RibMiddlewareFn = async (_e, next) => { order.push('mw2'); await next(); };
    const handler = jest.fn().mockImplementation(async () => { order.push('handler'); });

    bus.use(mw1);
    bus.use(mw2);
    bus.subscribe('sub1', 'Test', ['diagnostic.dtc.read'], handler);

    await bus.publish(makeEvent());

    expect(order).toEqual(['mw1', 'mw2', 'handler']);
  });

  it('dispatches to multiple subscribers for the same event', async () => {
    const h1 = jest.fn().mockResolvedValue(undefined);
    const h2 = jest.fn().mockResolvedValue(undefined);
    bus.subscribe('s1', 'S1', ['diagnostic.dtc.read'], h1);
    bus.subscribe('s2', 'S2', ['diagnostic.dtc.read'], h2);

    const result = await bus.publish(makeEvent());

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
    expect(result.handlerCount).toBe(2);
  });

  it('isHealthy returns true', () => {
    expect(bus.isHealthy()).toBe(true);
  });
});
