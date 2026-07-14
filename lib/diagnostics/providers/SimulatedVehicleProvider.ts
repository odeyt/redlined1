/**
 * lib/diagnostics/providers/SimulatedVehicleProvider.ts
 *
 * Deterministic simulated vehicle communication provider.
 * Returns fixture scan data — no hardware required.
 * Used when diagnostic_live_hardware_enabled flag is OFF (which is always true in V1).
 */

import type { VehicleDiagnosticProvider, VehicleScanResult, LiveDataRequest } from './VehicleDiagnosticProvider';
import type { DiagnosticLiveDataCapture } from '../types';

// Single fixture vehicle for the simulator
const SIM_VIN = 'SIMVIN00000000001';

export class SimulatedVehicleProvider implements VehicleDiagnosticProvider {
  readonly providerName = 'simulated';
  readonly interfaceType = 'SIMULATED';
  readonly isSimulated = true;

  async isReady(): Promise<boolean> {
    return true;
  }

  async scan(sessionId: string, shopId: string): Promise<VehicleScanResult> {
    const now = new Date().toISOString();
    const moduleId = `sim-module-ecm-${sessionId}`;

    return {
      vehicle: {
        vin: SIM_VIN,
        year: 2018,
        make: 'Toyota',
        model: 'Camry',
        trim: 'SE',
        engineCode: '2AR-FE',
        fuelType: 'GASOLINE',
        transmissionType: 'AUTOMATIC',
        odometerKm: 95000,
        vinSource: 'SCAN',
        identificationConfidence: 'HIGH',
      },
      interface: {
        id: `sim-interface-${sessionId}`,
        type: 'SIMULATED',
        displayName: 'RedlineD1 Simulator',
        isSimulated: true,
        connectedAt: now,
      },
      modules: [
        {
          id: moduleId,
          sessionId,
          shopId,
          name: 'Engine Control Module',
          address: '0x7E0',
          protocol: 'ISO_15765_4_CAN',
          supportsObd: true,
          ecuId: 'SIM-ECM-001',
          softwareVersion: '1.0.0',
          hardwareVersion: '1.0',
          calibrationId: 'SIM-CAL-001',
          scannedAt: now,
        },
        {
          id: `sim-module-abs-${sessionId}`,
          sessionId,
          shopId,
          name: 'Anti-Lock Brake System',
          address: '0x7B0',
          protocol: 'ISO_15765_4_CAN',
          supportsObd: false,
          scannedAt: now,
        },
      ],
      dtcs: [
        {
          id: `sim-dtc-p0420-${sessionId}`,
          sessionId,
          shopId,
          moduleId,
          code: 'P0420',
          type: 'CONFIRMED',
          system: 'POWERTRAIN',
          description: 'Catalyst System Efficiency Below Threshold (Bank 1)',
          scannedAt: now,
        },
        {
          id: `sim-dtc-p0171-${sessionId}`,
          sessionId,
          shopId,
          moduleId,
          code: 'P0171',
          type: 'PENDING',
          system: 'POWERTRAIN',
          description: 'System Too Lean (Bank 1)',
          scannedAt: now,
        },
      ],
      freezeFrames: [
        {
          id: `sim-ff-p0420-${sessionId}`,
          sessionId,
          shopId,
          dtcCode: 'P0420',
          moduleId,
          parameters: [
            { value: 850, unit: 'rpm', timestamp: now, sourceModule: 'ECM', testConditions: 'idle' },
            { value: 88.5, unit: '°C', timestamp: now, sourceModule: 'ECM', testConditions: 'warmed up' },
            { value: 0.48, unit: 'lambda', timestamp: now, sourceModule: 'ECM', testConditions: 'closed loop' },
          ],
          rawPayload: '[SIMULATED FREEZE FRAME]',
          capturedAt: now,
        },
      ],
      scannedAt: now,
    };
  }

  async captureLiveData(
    sessionId: string,
    shopId: string,
    request: LiveDataRequest,
  ): Promise<DiagnosticLiveDataCapture> {
    const now = new Date().toISOString();
    const captureId = `sim-capture-${sessionId}`;
    const sampleCount = Math.min(request.durationSeconds * request.sampleRateHz, 60);

    const samples = Array.from({ length: sampleCount }, (_, i) => ({
      id: `sim-sample-${i}-${captureId}`,
      captureId,
      shopId,
      pid: '0x0C',
      measurement: {
        value: 800 + Math.floor(i * 0.5),
        unit: 'rpm',
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        sourceModule: 'ECM',
        testConditions: request.testConditions ?? 'idle',
      },
    }));

    return {
      id: captureId,
      sessionId,
      shopId,
      label: request.label ?? 'Simulated live data capture',
      durationSeconds: request.durationSeconds,
      sampleRateHz: request.sampleRateHz,
      testConditions: request.testConditions,
      samples,
      rawPayload: { simulated: true, sampleCount },
      capturedAt: now,
    };
  }
}
