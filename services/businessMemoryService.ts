// SI-9: Business Memory Service
// Client-facing service for retrieving shop and entity memory.
// All functions are shop-scoped and fail safely.

import { getShopId } from '@/lib/shopStore';
import type { BusinessMemoryItem, EntityMemorySummary, MemoryEntityType, MemorySummary } from '@/intelligence/memory/types';

// ── Helpers ───────────────────────────────────────────────────

function shopHeaders(): Record<string, string> {
  return { 'x-shop-id': getShopId() };
}

async function safeGet<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { headers: shopHeaders() });
    if (!res.ok) return fallback;
    const body = await res.json() as { disabled?: boolean; data?: T };
    if (body.disabled) return fallback;
    return (body.data as T) ?? fallback;
  } catch { return fallback; }
}

// ── Public API ────────────────────────────────────────────────

export async function getEntityMemory(
  entityType: MemoryEntityType,
  entityId: string,
): Promise<BusinessMemoryItem[]> {
  return safeGet<BusinessMemoryItem[]>(
    `/api/intelligence/memory?entity_type=${entityType}&entity_id=${entityId}`,
    [],
  );
}

export async function getCustomerMemory(customerId: string): Promise<BusinessMemoryItem[]> {
  return getEntityMemory('customer', customerId);
}

export async function getVehicleMemory(vehicleId: string): Promise<BusinessMemoryItem[]> {
  return getEntityMemory('vehicle', vehicleId);
}

export async function getShopMemory(): Promise<MemorySummary | null> {
  return safeGet<MemorySummary | null>('/api/intelligence/memory', null);
}

export async function refreshShopMemory(): Promise<{ ok: boolean }> {
  try {
    const res = await fetch('/api/intelligence/memory', {
      method: 'POST',
      headers: shopHeaders(),
    });
    return { ok: res.ok };
  } catch { return { ok: false }; }
}

export async function refreshEntityMemory(
  entityType: MemoryEntityType,
  entityId: string,
): Promise<{ ok: boolean }> {
  try {
    const res = await fetch('/api/intelligence/memory', {
      method: 'POST',
      headers: { ...shopHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityType, entityId }),
    });
    return { ok: res.ok };
  } catch { return { ok: false }; }
}

export async function getMemorySummaryForCommandCenter(): Promise<{
  criticalCount: number;
  highCount: number;
  topItems: BusinessMemoryItem[];
} | null> {
  const summary = await getShopMemory();
  if (!summary) return null;
  return {
    criticalCount: summary.criticalCount,
    highCount:     summary.highCount,
    topItems:      summary.topItems,
  };
}

export function buildEntityMemorySummary(
  entityType: MemoryEntityType,
  entityId: string,
  items: BusinessMemoryItem[],
): EntityMemorySummary {
  return {
    entityType,
    entityId,
    items,
    lastRefreshedAt: items.length > 0
      ? items.reduce((latest, i) => i.lastSeenAt > latest ? i.lastSeenAt : latest, '')
      : null,
  };
}
