/**
 * lib/intelligence-bus/__tests__/event-types.test.ts
 *
 * Schema validation tests for all 31 RIB event types.
 */

import { RibEventSchema } from '../schemas';

function base(eventType: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: '00000000-0000-4000-a000-000000000001',
    eventType,
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
    ...extra,
  };
}

const storageRef = {
  storageProvider: 'supabase_storage',
  objectKey: 'key/file',
  contentType: 'application/octet-stream',
  sizeBytes: 1024,
  checksum: 'abc123',
  schemaVersion: '1.0',
  accessClassification: 'shop_private',
};

describe('RibBaseSchema envelope', () => {
  it('rejects unknown eventType', () => {
    expect(RibEventSchema.safeParse(base('unknown.event')).success).toBe(false);
  });

  it('rejects non-UUID eventId', () => {
    expect(RibEventSchema.safeParse(base('vehicle.connected', {
      eventId: 'not-a-uuid', vin: null, hardwareType: 'elm', bridgeDeviceId: null, protocolDetected: null,
    })).success).toBe(false);
  });

  it('rejects wrong schemaVersion', () => {
    expect(RibEventSchema.safeParse(base('vehicle.connected', {
      schemaVersion: '2.0', vin: null, hardwareType: 'elm', bridgeDeviceId: null, protocolDetected: null,
    })).success).toBe(false);
  });

  it('rejects eventDepth above 10', () => {
    expect(RibEventSchema.safeParse(base('vehicle.connected', {
      eventDepth: 11, vin: null, hardwareType: 'elm', bridgeDeviceId: null, protocolDetected: null,
    })).success).toBe(false);
  });

  it('rejects non-ISO occurredAt', () => {
    expect(RibEventSchema.safeParse(base('vehicle.connected', {
      occurredAt: 'not-a-date', vin: null, hardwareType: 'elm', bridgeDeviceId: null, protocolDetected: null,
    })).success).toBe(false);
  });
});

const validCases: Array<[string, Record<string, unknown>]> = [
  ['vehicle.connected', { vin: 'WBA12345', hardwareType: 'elm327', bridgeDeviceId: null, protocolDetected: 'ISO9141' }],
  ['vehicle.identified', { vin: 'WBA12345', year: 2020, make: 'BMW', model: 'X5', engineCode: 'N20', ecuCount: 12 }],
  ['vehicle.disconnected', { durationSeconds: 120 }],
  ['vehicle.mileage_updated', { previousOdometerKm: null, currentOdometerKm: 50000, source: 'obd' }],
  ['diagnostic.session.created', { vehicleYear: 2020, vehicleMake: 'Toyota', vehicleModel: 'Hilux', complaintText: 'rough idle' }],
  ['diagnostic.session.completed', { finalStatus: 'resolved', dtcCodesFound: ['P0300'], hypothesisCount: 3, confirmedRepair: true, totalDurationMinutes: 45 }],
  ['diagnostic.module.detected', { moduleId: 'ECM', moduleName: 'Engine Control Module', address: '0x7E0', protocol: 'ISO15765', dtcCount: 2 }],
  ['diagnostic.dtc.read', { dtcCode: 'P0300', description: 'Random misfire', system: 'engine', moduleId: 'ECM', isPending: false, isPermanent: false, odometerKm: 50000 }],
  ['diagnostic.freeze_frame.captured', { dtcCode: 'P0300', parameters: { rpm: { value: 800, unit: 'rpm' } }, capturedAt: '2025-01-01T00:00:00Z' }],
  ['diagnostic.live_data.captured', { durationSeconds: 30, sampleCount: 300, pidCodes: ['0x0C'], captureId: '00000000-0000-4000-a000-000000000010', storageRef: null }],
  ['diagnostic.waveform.uploaded', { channel: 'A', durationMs: 5000, sampleRate: 20000, storageRef }],
  ['diagnostic.measurement.recorded', { measurementType: 'voltage', value: 12.4, unit: 'V', sourceModule: 'meter', passOrFail: 'pass' }],
  ['diagnostic.image.uploaded', { fileName: 'photo.jpg', mimeType: 'image/jpeg', capturedAt: null, storageRef }],
  ['diagnostic.pdf.uploaded', { fileName: 'tsb.pdf', documentType: 'tsb', storageRef }],
  ['diagnostic.reasoning.requested', { providerName: 'claude', modelName: 'claude-sonnet-4-6', promptVersion: '1.0', dtcCodes: ['P0300'], hypothesisCount: 0 }],
  ['diagnostic.reasoning.completed', { providerName: 'claude', modelName: 'claude-sonnet-4-6', hypothesesGenerated: 3, primaryHypothesis: 'Ignition coil failure', confidenceScore: 0.82, durationMs: 1200, isSimulated: false }],
  ['diagnostic.claude_review.completed', { reviewedHypotheses: 3, agreementLevel: 'agree', additionalInsights: true, confidenceAdjustment: 0.05, durationMs: 800 }],
  ['diagnostic.hypothesis.updated', { hypothesisId: '00000000-0000-4000-a000-000000000020', description: 'Coil failure', confidenceScore: 0.9, confidenceBand: 'high', action: 'promoted', isAiDerived: true }],
  ['diagnostic.next_test.generated', { testPlanId: '00000000-0000-4000-a000-000000000030', testCount: 3, primaryTestDescription: 'Measure coil resistance', estimatedMinutes: 15 }],
  ['diagnostic.technician_result.entered', { testResultId: '00000000-0000-4000-a000-000000000040', testDescription: 'Coil resistance test', outcome: 'fail', value: '0.2', unit: 'ohm', notes: null }],
  ['repair.verified', { repairCaseId: '00000000-0000-4000-a000-000000000050', dtcCodesFixed: ['P0300'], rootCause: 'Ignition coil', partsReplaced: ['coil'], laborMinutes: 60, outcomeStatus: 'resolved', technicianNotes: null, totalCost: 1500, customerId: null }],
  ['repair.recommendation.created', { recommendationId: '00000000-0000-4000-a000-000000000060', description: 'Replace coil', estimatedCost: 1200, urgency: 'high', basedOnHypothesis: null }],
  ['service.completed', { serviceType: 'oil_change', laborMinutes: 30, partsUsed: ['filter'], nextServiceDueKm: 55000, nextServiceDueDate: null }],
  ['job_card.updated', { jobCardId: '00000000-0000-4000-a000-000000000070', previousStatus: 'open', newStatus: 'in_progress', customerId: null, estimatedCompletionAt: null }],
  ['estimate.approved', { estimateId: '00000000-0000-4000-a000-000000000080', approvedAmount: 2500, currency: 'THB', customerId: null, lineItemCount: 3 }],
  ['invoice.paid', { invoiceId: '00000000-0000-4000-a000-000000000090', amount: 2500, currency: 'THB', customerId: null, paymentMethod: 'cash' }],
  ['customer.notified', { customerId: '00000000-0000-4000-a000-0000000000a0', channel: 'line', notificationType: 'repair_complete', success: true }],
  ['vehicle.health.updated', { overallScore: 80, previousScore: null, systemScores: { engine: 85 }, criticalSystemsAffected: [] }],
  ['fleet.health.updated', { customerId: '00000000-0000-4000-a000-0000000000b0', fleetSize: 5, fleetHealthScore: 75, highMaintenanceCount: 1, recurringPatternCount: 0 }],
  ['inventory.recommendation.created', { partNumber: 'NGK-BP6E', partName: 'Spark plug', currentStock: 2, recommendedReorderQty: 10, urgency: 'medium', estimatedDaysUntilStockout: 5 }],
  ['failure.predicted', { predictionId: '00000000-0000-4000-a000-0000000000c0', componentName: 'Water pump', failureProbability: 0.78, estimatedMileageAtFailure: 55000, estimatedDaysUntilFailure: 30, evidenceType: 'coolant_temp_trend', isAiDerived: false }],
];

describe.each(validCases)('%s — valid', (eventType, extra) => {
  it('parses successfully', () => {
    expect(RibEventSchema.safeParse(base(eventType, extra)).success).toBe(true);
  });
});

describe('invalid event payloads', () => {
  it('rejects repair.verified with invalid outcomeStatus', () => {
    expect(RibEventSchema.safeParse(base('repair.verified', {
      repairCaseId: '00000000-0000-4000-a000-000000000050', dtcCodesFixed: [], rootCause: 'x',
      partsReplaced: [], laborMinutes: 0, outcomeStatus: 'not_real',
      technicianNotes: null, totalCost: null, customerId: null,
    })).success).toBe(false);
  });

  it('rejects vehicle.mileage_updated with invalid source', () => {
    expect(RibEventSchema.safeParse(base('vehicle.mileage_updated', {
      previousOdometerKm: null, currentOdometerKm: 1000, source: 'satellite',
    })).success).toBe(false);
  });

  it('rejects diagnostic.reasoning.completed with confidenceScore above 1', () => {
    expect(RibEventSchema.safeParse(base('diagnostic.reasoning.completed', {
      providerName: 'claude', modelName: 'm', hypothesesGenerated: 1,
      primaryHypothesis: null, confidenceScore: 1.5, durationMs: 100, isSimulated: false,
    })).success).toBe(false);
  });

  it('rejects failure.predicted with isAiDerived true', () => {
    expect(RibEventSchema.safeParse(base('failure.predicted', {
      predictionId: '00000000-0000-4000-a000-000000000001',
      componentName: 'pump', failureProbability: 0.5,
      estimatedMileageAtFailure: null, estimatedDaysUntilFailure: null,
      evidenceType: 'trend', isAiDerived: true,
    })).success).toBe(false);
  });

  it('rejects estimate.approved with currency not 3 chars', () => {
    expect(RibEventSchema.safeParse(base('estimate.approved', {
      estimateId: '00000000-0000-4000-a000-000000000080',
      approvedAmount: 100, currency: 'THAI', customerId: null, lineItemCount: 1,
    })).success).toBe(false);
  });

  it('rejects vehicle.health.updated with overallScore above 100', () => {
    expect(RibEventSchema.safeParse(base('vehicle.health.updated', {
      overallScore: 101, previousScore: null, systemScores: {}, criticalSystemsAffected: [],
    })).success).toBe(false);
  });
});
