/**
 * lib/platform/hardware/HardwareProvider.ts
 *
 * Hardware provider abstraction — all future diagnostic hardware implements
 * this common interface. Adding new hardware requires only a new provider class;
 * no orchestrator or business logic changes.
 *
 * Supported hardware (current and planned):
 * - J2534 PassThru (Windows DLL via Bridge)
 * - OBD-II Bluetooth (ELM327)
 * - OBD-II USB (ELM327)
 * - CAN FD (future — extended data rate)
 * - DoIP (Diagnostics over IP — ISO 13400)
 * - VCI (Vehicle Communication Interface)
 * - Oscilloscope
 * - Thermal Camera
 * - Digital Multimeter
 * - Battery Analyzer
 * - ADAS Calibration Targets
 * - Wheel Alignment System
 *
 * V1: only SIMULATED and J2534_BRIDGE are implemented.
 * All others return HardwareCapability.NOT_YET_SUPPORTED.
 */

// ── Hardware types ─────────────────────────────────────────────────────────────

export type HardwareType =
  | 'SIMULATED'
  | 'J2534_PASSTHRU'
  | 'OBD2_BLUETOOTH'
  | 'OBD2_USB'
  | 'CAN_FD'
  | 'DOIP'
  | 'VCI'
  | 'OSCILLOSCOPE'
  | 'THERMAL_CAMERA'
  | 'DIGITAL_MULTIMETER'
  | 'BATTERY_ANALYZER'
  | 'ADAS_TARGET'
  | 'WHEEL_ALIGNMENT';

export type HardwareCapability =
  | 'SUPPORTED'
  | 'NOT_YET_SUPPORTED'
  | 'REQUIRES_CALIBRATION'
  | 'REQUIRES_CERTIFICATION';

// ── Hardware device info ───────────────────────────────────────────────────────

export interface HardwareDeviceInfo {
  deviceId: string;
  hardwareType: HardwareType;
  displayName: string;
  vendorName?: string;
  firmwareVersion?: string;
  driverVersion?: string;
  serialNumber?: string;
  isConnected: boolean;
  isCalibrated: boolean;
  lastSeenAt?: string;
  capabilities: Partial<Record<HardwareCapability, boolean>>;
}

// ── Measurement result ─────────────────────────────────────────────────────────

export interface HardwareMeasurement {
  deviceId: string;
  hardwareType: HardwareType;
  measurementType: string;
  value: number | string;
  unit: string;
  timestamp: string;
  rawValue?: string;
  isSimulated: boolean;
}

// ── Provider interface ─────────────────────────────────────────────────────────

export interface HardwareProvider {
  readonly hardwareType: HardwareType;
  readonly displayName: string;
  readonly isSimulated: boolean;
  readonly capability: HardwareCapability;

  connect(): Promise<HardwareDeviceInfo>;
  disconnect(): Promise<void>;
  isConnected(): Promise<boolean>;
  measure(params: Record<string, unknown>): Promise<HardwareMeasurement[]>;
}

// ── Hardware registry ──────────────────────────────────────────────────────────

export class HardwareRegistry {
  private readonly providers = new Map<HardwareType, HardwareProvider>();

  register(provider: HardwareProvider): void {
    this.providers.set(provider.hardwareType, provider);
  }

  get(type: HardwareType): HardwareProvider | undefined {
    return this.providers.get(type);
  }

  listAvailable(): HardwareProvider[] {
    return Array.from(this.providers.values()).filter((p) => p.capability === 'SUPPORTED');
  }

  getCapability(type: HardwareType): HardwareCapability {
    return this.providers.get(type)?.capability ?? 'NOT_YET_SUPPORTED';
  }
}

// ── Stub provider for unsupported hardware ────────────────────────────────────

export class UnsupportedHardwareProvider implements HardwareProvider {
  readonly isSimulated = false;
  readonly capability = 'NOT_YET_SUPPORTED' as const;

  constructor(
    readonly hardwareType: HardwareType,
    readonly displayName: string,
  ) {}

  async connect(): Promise<HardwareDeviceInfo> {
    throw new Error(`${this.displayName} is not yet supported in this version.`);
  }
  async disconnect(): Promise<void> {}
  async isConnected(): Promise<boolean> { return false; }
  async measure(): Promise<HardwareMeasurement[]> {
    throw new Error(`${this.displayName} is not yet supported in this version.`);
  }
}

// Singleton registry — register all known hardware providers at startup
export const hardwareRegistry = new HardwareRegistry();

// Register stubs for all planned hardware types
const PLANNED_HARDWARE: Array<[HardwareType, string]> = [
  ['OBD2_BLUETOOTH', 'OBD-II Bluetooth (ELM327)'],
  ['OBD2_USB', 'OBD-II USB (ELM327)'],
  ['CAN_FD', 'CAN FD Interface'],
  ['DOIP', 'DoIP (ISO 13400)'],
  ['VCI', 'Vehicle Communication Interface'],
  ['OSCILLOSCOPE', 'Oscilloscope'],
  ['THERMAL_CAMERA', 'Thermal Camera'],
  ['DIGITAL_MULTIMETER', 'Digital Multimeter'],
  ['BATTERY_ANALYZER', 'Battery Analyzer'],
  ['ADAS_TARGET', 'ADAS Calibration Targets'],
  ['WHEEL_ALIGNMENT', 'Wheel Alignment System'],
];

for (const [type, name] of PLANNED_HARDWARE) {
  hardwareRegistry.register(new UnsupportedHardwareProvider(type, name));
}
