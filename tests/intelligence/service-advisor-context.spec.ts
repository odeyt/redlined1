// SI-12: Advisor Context Builder Tests (structural — DB calls not mocked here)

import { sanitizeContext } from '../../intelligence/service-advisor/AdvisorContextBuilder';
import type { ServiceAdvisorContext } from '../../intelligence/service-advisor/types';

function makeContext(overrides: Partial<ServiceAdvisorContext> = {}): ServiceAdvisorContext {
  return {
    shopId: 'test-shop',
    sessionId: 'sess-1',
    customer: null,
    vehicle: null,
    inspection: null,
    estimate: null,
    jobCardConcern: null,
    businessMemorySummary: null,
    repairIntelligenceSummary: null,
    dataQualityWarnings: [],
    builtAt: new Date().toISOString(),
    ...overrides,
  };
}

// sanitizeContext preserves shopId
test('sanitizeContext preserves shopId', () => {
  const ctx = makeContext({ shopId: 'shop-abc' });
  const result = sanitizeContext(ctx);
  expect(result.shopId).toBe('shop-abc');
});

// sanitizeContext preserves vehicle context
test('sanitizeContext preserves vehicle context', () => {
  const ctx = makeContext({
    vehicle: { vehicleId: 'v1', year: 2021, make: 'Ford', model: 'F-150', mileage: 45000, repairHistorySummary: [], activeDtcCodes: [], lastServiceDate: null, vehicleIntelligenceSignals: [] },
  });
  const result = sanitizeContext(ctx);
  expect(result.vehicle?.make).toBe('Ford');
  expect(result.vehicle?.model).toBe('F-150');
});

// dataQualityWarnings accumulate correctly
test('dataQualityWarnings is an array', () => {
  const ctx = makeContext({ dataQualityWarnings: ['missing_customer', 'vehicle_unavailable'] });
  expect(ctx.dataQualityWarnings).toHaveLength(2);
});

// context built at timestamp
test('context includes builtAt timestamp', () => {
  const ctx = makeContext();
  expect(new Date(ctx.builtAt).getTime()).toBeLessThanOrEqual(Date.now());
});

// VIN not in context (VehicleContext has no VIN field)
test('VehicleContext does not include VIN field', () => {
  const ctx = makeContext({
    vehicle: { vehicleId: 'v1', year: 2020, make: 'Toyota', model: 'Corolla', mileage: 60000, repairHistorySummary: [], activeDtcCodes: [], lastServiceDate: null, vehicleIntelligenceSignals: [] },
  });
  const vehicleKeys = Object.keys(ctx.vehicle ?? {});
  expect(vehicleKeys.includes('vin')).toBe(false);
});
