/**
 * lib/intelligence-bus/__tests__/middleware.test.ts
 *
 * Tests for individual middleware:
 *   - validationMiddleware: rejects bad events, passes good events
 *   - correlationMiddleware: mints missing correlationId
 *   - loggingMiddleware: calls next, rethrows errors, includes causality fields
 */

import { validationMiddleware, RibValidationError } from '../middleware/validation';
import { correlationMiddleware } from '../middleware/correlation';
import { loggingMiddleware } from '../middleware/logging';
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

describe('validationMiddleware', () => {
  it('calls next for a valid event', async () => {
    const next = jest.fn().mockResolvedValue(undefined);
    await validationMiddleware(makeEvent(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('throws RibValidationError for an invalid event', async () => {
    const next = jest.fn();
    const bad = { ...makeEvent(), eventId: 'not-uuid' } as unknown as RibEvent;
    await expect(validationMiddleware(bad, next)).rejects.toBeInstanceOf(RibValidationError);
    expect(next).not.toHaveBeenCalled();
  });

  it('RibValidationError includes eventType', async () => {
    const next = jest.fn();
    try {
      await validationMiddleware({ ...makeEvent(), schemaVersion: '9.9' } as unknown as RibEvent, next);
    } catch (err) {
      expect(err).toBeInstanceOf(RibValidationError);
      expect((err as RibValidationError).eventType).toBe('vehicle.connected');
    }
  });
});

describe('correlationMiddleware', () => {
  it('leaves correlationId unchanged when already set', async () => {
    const next = jest.fn().mockResolvedValue(undefined);
    const event = makeEvent({ correlationId: '00000000-0000-4000-a000-000000000002' });
    await correlationMiddleware(event, next);
    expect(event.correlationId).toBe('00000000-0000-4000-a000-000000000002');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('mints a UUID when correlationId is empty', async () => {
    const next = jest.fn().mockResolvedValue(undefined);
    const event = makeEvent({ correlationId: '' });
    await correlationMiddleware(event, next);
    expect(event.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe('loggingMiddleware', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => { jest.restoreAllMocks(); });

  it('calls next', async () => {
    const next = jest.fn().mockResolvedValue(undefined);
    await loggingMiddleware(makeEvent(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rethrows errors from next', async () => {
    const next = jest.fn().mockRejectedValue(new Error('downstream'));
    await expect(loggingMiddleware(makeEvent(), next)).rejects.toThrow('downstream');
  });

  it('includes causality fields in log output', async () => {
    const logSpy = jest.spyOn(console, 'log');
    const next = jest.fn().mockResolvedValue(undefined);
    const event = makeEvent({ causationId: '00000000-0000-4000-a000-000000000099', eventDepth: 2, originModule: 'vehicle_health' });
    await loggingMiddleware(event, next);
    const loggedStr = logSpy.mock.calls[0][1] as string;
    const logged = JSON.parse(loggedStr);
    expect(logged.causationId).toBe('00000000-0000-4000-a000-000000000099');
    expect(logged.eventDepth).toBe(2);
    expect(logged.originModule).toBe('vehicle_health');
  });
});
