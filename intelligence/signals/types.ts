export type SignalSeverity = 'info' | 'warning' | 'critical';

export interface IntelligenceSignal {
  id?: string;
  shopId: string;
  signalKey: string;
  signalType: string;
  entityType?: string | null;
  entityId?: string | null;
  value?: number | null;
  textValue?: string | null;
  severity: SignalSeverity;
  metadata: Record<string, unknown>;
  createdAt?: string;
}

export type SignalMap = Record<string, number | string | null>;
