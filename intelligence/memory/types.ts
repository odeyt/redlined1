// SI-9: Business Memory Engine — Types
// Deterministic pattern memory. No AI. No embeddings.

// ── Enums ─────────────────────────────────────────────────────

export type MemoryType =
  | 'customer_memory'
  | 'vehicle_memory'
  | 'repair_memory'
  | 'revenue_memory'
  | 'risk_memory'
  | 'technician_memory'
  | 'parts_memory'
  | 'estimate_memory'
  | 'invoice_memory'
  | 'comeback_memory'
  | 'declined_work_memory'
  | 'shop_pattern_memory';

export type MemoryImportance = 'critical' | 'high' | 'medium' | 'low';

export type MemoryEntityType =
  | 'customer'
  | 'vehicle'
  | 'job_card'
  | 'repair_case'
  | 'repair_order'
  | 'estimate'
  | 'invoice'
  | 'technician'
  | 'part'
  | 'shop';

export type MemoryRelationshipType =
  | 'belongs_to'
  | 'related_vehicle'
  | 'related_customer'
  | 'related_technician'
  | 'related_part'
  | 'related_repair'
  | 'follow_up';

// ── Core entities ─────────────────────────────────────────────

export interface BusinessMemoryItem {
  id: string;
  shopId: string;
  memoryType: MemoryType;
  entityType: MemoryEntityType;
  entityId: string | null;
  title: string;
  summary: string | null;
  importance: MemoryImportance;
  confidence: number;          // 0.0–1.0
  sourceType: string | null;
  sourceId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  metadata: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessMemoryLink {
  id: string;
  shopId: string;
  memoryItemId: string;
  linkedEntityType: MemoryEntityType;
  linkedEntityId: string;
  relationshipType: MemoryRelationshipType;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface BusinessMemorySnapshot {
  id: string;
  shopId: string;
  entityType: MemoryEntityType;
  entityId: string;
  snapshotType: string;
  snapshotDate: string;
  snapshot: Record<string, unknown>;
  createdAt: string;
}

// ── Extraction context ─────────────────────────────────────────

export interface MemoryExtractionContext {
  shopId: string;
  entityType?: MemoryEntityType;
  entityId?: string;
  triggeredBy?: string;   // 'manual' | 'event_hook' | 'scheduled'
  dryRun?: boolean;
}

// ── Summary shapes ─────────────────────────────────────────────

export interface MemorySummary {
  shopId: string;
  totalItems: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  byType: Partial<Record<MemoryType, number>>;
  topItems: BusinessMemoryItem[];
  extractedAt: string;
}

export interface EntityMemorySummary {
  entityType: MemoryEntityType;
  entityId: string;
  items: BusinessMemoryItem[];
  lastRefreshedAt: string | null;
}

// ── Extraction result ──────────────────────────────────────────

export interface MemoryExtractionResult {
  shopId: string;
  itemsCreated: number;
  itemsUpdated: number;
  itemsArchived: number;
  durationMs: number;
  warnings: string[];
  dryRun: boolean;
}
