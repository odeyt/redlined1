/**
 * lib/intelligence-bus/__tests__/event-types.test.ts
 *
 * Tests that Zod schemas correctly validate and reject RIB events.
 */

import { RibEventSchema } from '../schemas';

function baseEnvelope() {
  return {
    eventId: '00000000-0000-0000-0000-000000000001',
    timestamp: '2025-01-01T00:00:00.000Z',
    organizationId: 'org-1',
    shopId: '00000000-0000-0000-0000-000000000002',
    technicianId: null,
    vehicleId: null,
    diagnosticSessionId: null,
    correlationId: 'corr-1',
    schemaVersion: '1.0' as const,
  };
}

describe('RibEventSchema', () => {
  it('validates a valid diagnostic.dtc.read event', () => {
    const event = {
      ...baseEnvelope(),
      eventType: 'diagnostic.dtc.read',
      dtcCode: 'P0420',
      description: null,
      system: null,
      moduleId: null,
      isPending: false,
      isPermanent: true,
      odometerKm: null,
    };
    expect(RibEventSchema.safeParse(event).success).toBe(true);
  });

  it('validates a valid repair.verified event', () => {
    const event = {
      ...baseEnvelope(),
      eventType: 'repair.verified',
      repairCaseId: '00000000-0000-0000-0000-000000000003',
      dtcCodesFixed: ['P0420'],
      rootCause: 'Catalytic converter degraded',
      partsReplaced: ['CAT-001'],
      laborMinutes: 120,
      outcomeStatus: 'resolved',
      technicianNotes: null,
      totalCost: 250.0,
      customerId: null,
    };
    expect(RibEventSchema.safeParse(event).success).toBe(true);
  });

  it('rejects event with invalid eventType', () => {
    const event = { ...baseEnvelope(), eventType: 'not.a.real.type' };
    expect(RibEventSchema.safeParse(event).success).toBe(false);
  });

  it('rejects event with invalid shopId (not UUID)', () => {
    const event = {
      ...baseEnvelope(),
      shopId: 'not-a-uuid',
      eventType: 'diagnostic.dtc.read',
      dtcCode: 'P0420',
      description: null,
      system: null,
      moduleId: null,
      isPending: false,
      isPermanent: true,
      odometerKm: null,
    };
    expect(RibEventSchema.safeParse(event).success).toBe(false);
  });

  it('rejects event with wrong schemaVersion', () => {
    const event = {
      ...baseEnvelope(),
      schemaVersion: '2.0',
      eventType: 'diagnostic.dtc.read',
      dtcCode: 'P0420',
      description: null,
      system: null,
      moduleId: null,
      isPending: false,
      isPermanent: true,
      odometerKm: null,
    };
    expect(RibEventSchema.safeParse(event).success).toBe(false);
  });

  it('rejects repair.verified with invalid outcomeStatus', () => {
    const event = {
      ...baseEnvelope(),
      eventType: 'repair.verified',
      repairCaseId: '00000000-0000-0000-0000-000000000003',
      dtcCodesFixed: [],
      rootCause: 'unknown',
      partsReplaced: [],
      laborMinutes: 60,
      outcomeStatus: 'not_a_status',
      technicianNotes: null,
      totalCost: null,
      customerId: null,
    };
    expect(RibEventSchema.safeParse(event).success).toBe(false);
  });

  it('validates vehicle.connected event', () => {
    const event = {
      ...baseEnvelope(),
      vehicleId: '00000000-0000-0000-0000-000000000004',
      eventType: 'vehicle.connected',
      vin: '1HGCM82633A004352',
      hardwareType: 'SIMULATED',
      bridgeDeviceId: null,
      protocolDetected: 'ISO15765',
    };
    expect(RibEventSchema.safeParse(event).success).toBe(true);
  });

  it('validates failure.predicted with isAiDerived=false', () => {
    const event = {
      ...baseEnvelope(),
      vehicleId: '00000000-0000-0000-0000-000000000004',
      eventType: 'failure.predicted',
      predictionId: '00000000-0000-0000-0000-000000000005',
      componentName: 'Timing Belt',
      failureProbability: 0.82,
      estimatedMileageAtFailure: 155000,
      estimatedDaysUntilFailure: 30,
      evidenceType: 'mileage_threshold',
      isAiDerived: false,
    };
    expect(RibEventSchema.safeParse(event).success).toBe(true);
  });
});
