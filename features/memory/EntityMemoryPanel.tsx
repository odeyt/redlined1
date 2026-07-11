'use client';

// SI-9: Entity Memory Panel
// Lightweight memory panels for customer, vehicle, and repair detail pages.
// NOT mounted yet — rendered only when entity_memory_panels flag is ON.
// Displays local memory only. No AI. No external calls.

import { useState, useEffect } from 'react';

interface MemoryItem {
  id: string;
  memoryType: string;
  entityType: string;
  title: string;
  summary: string | null;
  importance: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  lastSeenAt: string;
  metadata: Record<string, unknown>;
}

const IMP_COLOR: Record<string, string> = {
  critical: '#dc2626',
  high:     '#ea580c',
  medium:   '#d97706',
  low:      '#6b7280',
};

const MEMORY_ICON: Record<string, string> = {
  customer_memory:     '👤',
  vehicle_memory:      '🚗',
  repair_memory:       '🔧',
  revenue_memory:      '💵',
  risk_memory:         '⚠️',
  technician_memory:   '🧑‍🔧',
  parts_memory:        '🔩',
  estimate_memory:     '📋',
  invoice_memory:      '🧾',
  comeback_memory:     '↩️',
  declined_work_memory:'❌',
  shop_pattern_memory: '📊',
};

function MemoryCard({ item }: { item: MemoryItem }) {
  const color = IMP_COLOR[item.importance] ?? '#6b7280';
  const icon  = MEMORY_ICON[item.memoryType] ?? '🧠';
  return (
    <div style={{
      background: `${color}06`,
      border: `1px solid ${color}20`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 8, padding: '10px 12px',
      display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: item.summary ? 2 : 0 }}>{item.title}</div>
        {item.summary && <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{item.summary}</div>}
      </div>
      <span style={{
        fontSize: 9, fontWeight: 700, color, background: `${color}14`,
        borderRadius: 20, padding: '2px 7px', flexShrink: 0,
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>{item.importance}</span>
    </div>
  );
}

// ── Customer Memory Panel ──────────────────────────────────────

export function CustomerMemoryPanel({
  customerId,
  shopId,
}: {
  customerId: string;
  shopId: string;
}) {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(
          `/api/intelligence/memory?entity_type=customer&entity_id=${customerId}`,
          { headers: { 'x-shop-id': shopId } },
        );
        if (!res.ok) return;
        const body = await res.json() as { disabled?: boolean; data?: MemoryItem[] };
        if (!body.disabled && body.data) setItems(body.data);
      } catch { /* fail silently */ } finally { setLoading(false); }
    })();
  }, [customerId, shopId]);

  if (loading || items.length === 0) return null;

  return (
    <div>
      <div className="section-label" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>🧠</span> Customer Memory
        <div style={{ flex: 1, height: 1, background: 'var(--line)', marginLeft: 4 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(item => <MemoryCard key={item.id} item={item} />)}
      </div>
    </div>
  );
}

// ── Vehicle Memory Panel ──────────────────────────────────────

export function VehicleMemoryPanel({
  vehicleId,
  shopId,
}: {
  vehicleId: string;
  shopId: string;
}) {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(
          `/api/intelligence/memory?entity_type=vehicle&entity_id=${vehicleId}`,
          { headers: { 'x-shop-id': shopId } },
        );
        if (!res.ok) return;
        const body = await res.json() as { disabled?: boolean; data?: MemoryItem[] };
        if (!body.disabled && body.data) setItems(body.data);
      } catch { /* fail silently */ } finally { setLoading(false); }
    })();
  }, [vehicleId, shopId]);

  if (loading || items.length === 0) return null;

  return (
    <div>
      <div className="section-label" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>🧠</span> Vehicle Memory
        <div style={{ flex: 1, height: 1, background: 'var(--line)', marginLeft: 4 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(item => <MemoryCard key={item.id} item={item} />)}
      </div>
    </div>
  );
}

// ── Repair Case Memory Panel ──────────────────────────────────

export function RepairCaseMemoryPanel({
  repairCaseId,
  vehicleId,
  shopId,
}: {
  repairCaseId: string;
  vehicleId?: string;
  shopId: string;
}) {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        // Load repair case memory + related vehicle memory
        const urls = [
          `/api/intelligence/memory?entity_type=repair_case&entity_id=${repairCaseId}`,
          vehicleId ? `/api/intelligence/memory?entity_type=vehicle&entity_id=${vehicleId}` : null,
        ].filter(Boolean) as string[];

        const results = await Promise.all(
          urls.map(url => fetch(url, { headers: { 'x-shop-id': shopId } })
            .then(r => r.ok ? r.json() as Promise<{ disabled?: boolean; data?: MemoryItem[] }> : Promise.resolve({ disabled: false, data: [] as MemoryItem[] }))
            .catch(() => ({ disabled: false, data: [] as MemoryItem[] }))),
        );

        const allItems = results.flatMap(b => (!b.disabled && b.data) ? b.data : []);
        setItems(allItems.slice(0, 5));
      } catch { /* fail silently */ } finally { setLoading(false); }
    })();
  }, [repairCaseId, vehicleId, shopId]);

  if (loading || items.length === 0) return null;

  return (
    <div>
      <div className="section-label" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>🧠</span> Related Memory
        <div style={{ flex: 1, height: 1, background: 'var(--line)', marginLeft: 4 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(item => <MemoryCard key={item.id} item={item} />)}
      </div>
    </div>
  );
}
