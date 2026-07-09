// SI-8: Sapelee Payload Builder
// Builds safe, PII-free payloads from RedlineD1 intelligence data.
// NEVER includes: customer phone, email, address, VIN, payment details, private notes.

import type { ShopIntelligenceMetrics } from '@/intelligence/metrics/types';
import type { MorningBrief } from '@/intelligence/morning-brief/types';

// ── PII field blocklist ───────────────────────────────────────
// These are NEVER sent externally, regardless of any other config.
const PII_FIELDS = new Set([
  'phone', 'phone_number', 'mobile', 'cell',
  'email', 'email_address',
  'address', 'street', 'city', 'zip', 'postal_code', 'state', 'country',
  'vin', 'vehicle_vin', 'vin_number',
  'payment', 'card', 'credit_card', 'bank', 'account_number',
  'ssn', 'tax_id', 'license_plate',
  'customer_name', 'first_name', 'last_name', 'full_name',
  'notes', 'private_notes', 'technician_notes', 'internal_notes',
  'invoice_amount', 'payment_amount', 'total_amount', 'balance_due',
]);

/** Deep-redact any object, removing PII fields recursively. */
export function redactPII(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase();
    if (PII_FIELDS.has(key)) continue;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactPII(v as Record<string, unknown>);
    } else if (Array.isArray(v)) {
      out[k] = v.map(item =>
        typeof item === 'object' && item !== null
          ? redactPII(item as Record<string, unknown>)
          : item,
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── Metrics payload ───────────────────────────────────────────

export interface SapeleeMetricsPayload {
  shopId: string;
  metricDate: string;
  // Revenue (aggregates only — no per-invoice amounts)
  revenueToday: number;
  revenueYesterday: number;
  revenueOpportunityTotal: number;
  // Counts (no customer-identifying fields)
  unpaidInvoiceCount: number;
  overdueInvoiceCount: number;
  openEstimateCount: number;
  staleEstimateCount: number;
  completedNotInvoicedCount: number;
  openJobCount: number;
  stuckJobCount: number;
  lowInventoryCount: number;
  repairCasesToday: number;
  technicianActiveCount: number;
  technicianIdleCount: number;
  shopHealthScore: number;
  calculatedAt: string;
}

export function buildMetricsPayload(metrics: ShopIntelligenceMetrics): SapeleeMetricsPayload {
  return {
    shopId:                    metrics.shopId,
    metricDate:                metrics.metricDate,
    revenueToday:              metrics.revenueToday,
    revenueYesterday:          metrics.revenueYesterday,
    revenueOpportunityTotal:   metrics.revenueOpportunityTotal,
    unpaidInvoiceCount:        metrics.unpaidInvoiceCount,
    overdueInvoiceCount:       metrics.overdueInvoiceCount,
    openEstimateCount:         metrics.openEstimateCount,
    staleEstimateCount:        metrics.staleEstimateCount,
    completedNotInvoicedCount: metrics.completedNotInvoicedCount,
    openJobCount:              metrics.openJobCount,
    stuckJobCount:             metrics.stuckJobCount,
    lowInventoryCount:         metrics.lowInventoryCount,
    repairCasesToday:          metrics.repairCasesToday,
    technicianActiveCount:     metrics.technicianActiveCount,
    technicianIdleCount:       metrics.technicianIdleCount,
    shopHealthScore:           metrics.shopHealthScore,
    calculatedAt:              metrics.calculatedAt,
  };
}

// ── Morning Brief payload ─────────────────────────────────────

export interface Sapelee_MorningBriefPayload {
  shopId: string;
  briefDate: string;
  shopHealthScore: number;
  executiveScore: number;
  // Aggregated numbers only
  cashCollection: {
    unpaidCount: number;
    unpaidTotal: number;
    overdueCount: number;
    overdueTotal: number;
    urgency: string;
  };
  revenueOpportunities: Array<{
    key: string;
    label: string;
    count: number;
    urgency: string;
  }>;
  operationalRisks: Array<{
    key: string;
    label: string;
    count: number;
    severity: string;
  }>;
  todayPriorities: Array<{
    rank: number;
    title: string;
    category: string;
    recommendationKey: string;
    decisionScore: number;
    estimatedTimeMinutes: number;
  }>;
  technicianSummary: {
    activeCount: number;
    idleCount: number;
    bottlenecks: string[];
  };
  inventorySummary: {
    lowCount: number;
    reorderUrgency: string;
  };
  recommendedFocus: string;
  generatedAt: string;
}

export function buildMorningBriefPayload(brief: MorningBrief): Sapelee_MorningBriefPayload {
  return {
    shopId:           brief.shopId,
    briefDate:        brief.briefDate,
    shopHealthScore:  brief.shopHealthScore,
    executiveScore:   brief.executiveScore,
    cashCollection: {
      unpaidCount:  brief.cashCollection.unpaidCount,
      unpaidTotal:  brief.cashCollection.unpaidTotal,
      overdueCount: brief.cashCollection.overdueCount,
      overdueTotal: brief.cashCollection.overdueTotal,
      urgency:      brief.cashCollection.collectionUrgency,
    },
    revenueOpportunities: brief.revenueOpportunities.map(op => ({
      key:     op.key,
      label:   op.label,
      count:   op.count,
      urgency: op.urgency,
      // total excluded — individual invoice amounts are PII-adjacent
    })),
    operationalRisks: brief.operationalRisks.map(r => ({
      key:      r.key,
      label:    r.label,
      count:    r.count,
      severity: r.severity,
    })),
    todayPriorities: brief.todayPriorities.map(p => ({
      rank:                 p.rank,
      title:                p.title,
      category:             p.category,
      recommendationKey:    p.recommendationKey,
      decisionScore:        p.decisionScore,
      estimatedTimeMinutes: p.estimatedTimeMinutes,
      // estimatedRevenue excluded — per-job amounts are PII-adjacent
    })),
    technicianSummary: {
      activeCount:  brief.technicianSummary.activeCount,
      idleCount:    brief.technicianSummary.idleCount,
      bottlenecks:  brief.technicianSummary.bottlenecks,
    },
    inventorySummary: {
      lowCount:       brief.inventorySummary.lowCount,
      reorderUrgency: brief.inventorySummary.reorderUrgency,
    },
    recommendedFocus: brief.recommendedFocus,
    generatedAt:      brief.generatedAt,
  };
}

// ── Anonymized operational event payload ──────────────────────

export interface SapeleeEventPayload {
  eventType: string;
  shopId: string;
  entityType: string;
  // entityId is hashed — never the real UUID (could be joined to expose data)
  entityIdHash: string;
  timestamp: string;
  payload: Record<string, unknown>; // already PII-redacted
}

export function buildEventPayload(
  eventType: string,
  shopId: string,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>,
): SapeleeEventPayload {
  return {
    eventType,
    shopId,
    entityType,
    entityIdHash: hashId(entityId),
    timestamp:    new Date().toISOString(),
    payload:      redactPII(payload),
  };
}

/** One-way hash for entity IDs — prevents external join back to real records. */
function hashId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(31, h) + id.charCodeAt(i) | 0;
  }
  return `h_${Math.abs(h).toString(36)}`;
}
