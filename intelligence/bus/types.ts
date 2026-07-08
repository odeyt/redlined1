export type IntelligenceEventStatus = 'received' | 'processing' | 'processed' | 'failed' | 'skipped';

export interface IntelligenceBusEvent {
  id?: string;
  eventId: string;
  shopId: string;
  userId?: string | null;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  source: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  status: IntelligenceEventStatus;
  processedAt?: string | null;
  createdAt?: string;
}

export interface BusHealth {
  reachable: boolean;
  pendingEvents: number;
  processedToday: number;
  failedEvents: number;
  lastEventAt: string | null;
}
