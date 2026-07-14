/**
 * lib/diagnostics/providers/VehicleDiagnosticProvider.ts
 *
 * Abstract interface for vehicle communication layer.
 * Version 1 is strictly read-only. No programming, coding, adaptations,
 * security access, or DTC clearing in this version.
 */

import type {
  DiagnosticModule,
  DiagnosticDtc,
  DiagnosticFreezeFrame,
  DiagnosticLiveDataCapture,
  DiagnosticVehicle,
  DiagnosticInterface,
  DiagnosticPidDefinition,
} from '../types';

// ── Read-only vehicle scan result ─────────────────────────────────────────────

export interface VehicleScanResult {
  vehicle: DiagnosticVehicle;
  interface: DiagnosticInterface;
  modules: DiagnosticModule[];
  dtcs: DiagnosticDtc[];
  freezeFrames: DiagnosticFreezeFrame[];
  scannedAt: string;
}

// ── Live data request ─────────────────────────────────────────────────────────

export interface LiveDataRequest {
  pids: DiagnosticPidDefinition[];
  durationSeconds: number;
  sampleRateHz: number;
  testConditions?: string;
  label?: string;
}

// ── Provider interface (read-only) ────────────────────────────────────────────

export interface VehicleDiagnosticProvider {
  readonly providerName: string;
  readonly interfaceType: string;
  readonly isSimulated: boolean;

  /** Returns true if the provider is ready to communicate */
  isReady(): Promise<boolean>;

  /**
   * Full baseline scan: VIN, modules, all DTCs, all freeze frames.
   * READ ONLY — never clears codes or writes to ECU.
   */
  scan(sessionId: string, shopId: string): Promise<VehicleScanResult>;

  /**
   * Stream live PID data for the requested duration.
   * READ ONLY — no ECU commands are sent.
   */
  captureLiveData(
    sessionId: string,
    shopId: string,
    request: LiveDataRequest,
  ): Promise<DiagnosticLiveDataCapture>;
}
