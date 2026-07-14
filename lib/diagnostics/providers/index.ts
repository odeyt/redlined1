/**
 * lib/diagnostics/providers/index.ts
 *
 * Provider factory — selects the correct implementation based on feature flags.
 * All live-hardware and real-AI providers are gated behind flags that default OFF.
 */

export type { DiagnosticReasoningProvider, DiagnosticReviewProvider, DiagnosticReasoningContext, DiagnosticReviewContext } from './DiagnosticReasoningProvider';
export type { VehicleDiagnosticProvider, VehicleScanResult, LiveDataRequest } from './VehicleDiagnosticProvider';
export { MockReasoningProvider, MockReviewProvider } from './MockReasoningProvider';
export { SimulatedVehicleProvider } from './SimulatedVehicleProvider';
