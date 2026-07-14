/**
 * lib/intelligence-bus/__tests__/middleware.test.ts
 *
 * Tests for RIB middleware: validation, logging, correlation.
 */

import { validationMiddleware, RibValidationError } from '../middleware/validation';
import { correlationMiddleware } from '../middleware/correlation';
import type { RibEvent } from '../event-types';

function validDtcEvent(): RibEvent {
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
    dtcCode: 'P0171',
    description: null,
    system: null,
    moduleId: null,
    isPending: false,
    isPermanent: true,
    odometerKm: null,
  } as unknown as RibEvent;
}

describe('validationMiddleware', () => {
  it('calls next() for a valid event', async () => {
    const next = jest.fn().mockResolvedValue(undefined);
    await validationMiddleware(validDtcEvent(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('throws RibValidationError for an invalid event', async () => {
    const next = jest.fn();
    const badEvent = { ...validDtcEvent(), shopId: 'not-a-uuid' };

    await expect(validationMiddleware(badEvent as RibEvent, next)).rejects.toThrow(RibValidationError);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('correlationMiddleware', () => {
  it('passes through events that already have a correlationId', async () => {
    const next = jest.fn().mockResolvedValue(undefined);
    const event = validDtcEvent();
    await correlationMiddleware(event, next);
    expect(event.correlationId).toBe('corr-1');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('stamps a correlationId when missing', async () => {
    const next = jest.fn().mockResolvedValue(undefined);
    const event = { ...validDtcEvent(), correlationId: '' };
    await correlationMiddleware(event as RibEvent, next);
    expect(event.correlationId).toBeTruthy();
    expect(event.correlationId.length).toBeGreaterThan(10);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
