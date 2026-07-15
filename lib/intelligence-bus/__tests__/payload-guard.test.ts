/**
 * lib/intelligence-bus/__tests__/payload-guard.test.ts
 *
 * Tests for payload size and secret detection.
 */

import { detectSecrets, RibSecretLeakError, RibPayloadSizeError, MAX_EVENT_PAYLOAD_BYTES, payloadGuardMiddleware } from '../payload-guard';
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

describe('detectSecrets', () => {
  it('does not throw for a clean event', () => {
    expect(() => detectSecrets(makeEvent())).not.toThrow();
  });

  it.each([
    ['api_key', { api_key: 'abc' }],
    ['apikey', { apikey: 'abc' }],
    ['password', { password: 'secret' }],
    ['auth_token', { auth_token: 'xyz' }],
    ['service_role', { service_role: 'myRole' }],
    ['private_key', { private_key: 'pem' }],
    ['bearer', { bearer: 'token' }],
    ['credentials', { credentials: {} }],
  ])('throws for field name %s', (_label, extra) => {
    expect(() => detectSecrets({ ...makeEvent(), ...extra } as unknown as RibEvent)).toThrow(RibSecretLeakError);
  });
});

describe('payloadGuardMiddleware', () => {
  it('passes a normal event', async () => {
    const next = jest.fn().mockResolvedValue(undefined);
    await expect(payloadGuardMiddleware(makeEvent(), next)).resolves.toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('throws RibPayloadSizeError for oversized event', async () => {
    // Build an event that exceeds 64 KB
    const largeEvent = { ...makeEvent(), extraData: 'x'.repeat(MAX_EVENT_PAYLOAD_BYTES + 100) } as unknown as RibEvent;
    const next = jest.fn();
    await expect(payloadGuardMiddleware(largeEvent, next)).rejects.toBeInstanceOf(RibPayloadSizeError);
    expect(next).not.toHaveBeenCalled();
  });

  it('throws RibSecretLeakError when event contains a secret field', async () => {
    const leaky = { ...makeEvent(), api_key: 'should-not-be-here' } as unknown as RibEvent;
    const next = jest.fn();
    await expect(payloadGuardMiddleware(leaky, next)).rejects.toBeInstanceOf(RibSecretLeakError);
    expect(next).not.toHaveBeenCalled();
  });
});
