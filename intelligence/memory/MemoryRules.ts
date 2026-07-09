// SI-9: Business Memory Rules
// Deterministic extraction rules. No AI. No external calls.
// Each rule returns zero or more memory items to upsert.

import type { BusinessMemoryItem, MemoryImportance, MemoryType, MemoryEntityType } from './types';

// ── Helpers ───────────────────────────────────────────────────

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function partial(
  shopId: string,
  memoryType: MemoryType,
  entityType: MemoryEntityType,
  entityId: string | null,
  title: string,
  summary: string | null,
  importance: MemoryImportance,
  confidence: number,
  metadata: Record<string, unknown> = {},
): Omit<BusinessMemoryItem, 'id' | 'createdAt' | 'updatedAt'> {
  const now = new Date().toISOString();
  return {
    shopId, memoryType, entityType, entityId, title, summary,
    importance, confidence,
    sourceType: null, sourceId: null,
    firstSeenAt: now, lastSeenAt: now,
    metadata,
    isActive: true,
  };
}

// ── Rule 1: Customer Last Visit ───────────────────────────────

export function ruleCustomerLastVisit(
  shopId: string,
  customerId: string,
  lastCompletedJobDate: string | null,
): ReturnType<typeof partial> | null {
  const days = daysSince(lastCompletedJobDate);
  if (days === null) return null;

  const importance: MemoryImportance =
    days > 365 ? 'high' : days > 180 ? 'medium' : 'low';

  return partial(
    shopId, 'customer_memory', 'customer', customerId,
    `Customer last visited ${days} day${days === 1 ? '' : 's'} ago`,
    days > 180 ? 'Customer may need a follow-up outreach' : null,
    importance, 0.95,
    { daysSinceLastVisit: days, lastVisitDate: lastCompletedJobDate },
  );
}

// ── Rule 2: Customer Average Spend ───────────────────────────

export function ruleCustomerAverageSpend(
  shopId: string,
  customerId: string,
  invoiceTotals: number[],
): ReturnType<typeof partial> | null {
  if (invoiceTotals.length === 0) return null;
  const avg = invoiceTotals.reduce((a, b) => a + b, 0) / invoiceTotals.length;
  const importance: MemoryImportance = avg >= 500 ? 'high' : avg >= 200 ? 'medium' : 'low';

  return partial(
    shopId, 'customer_memory', 'customer', customerId,
    `Average invoice: $${avg.toFixed(0)} across ${invoiceTotals.length} invoice${invoiceTotals.length === 1 ? '' : 's'}`,
    null, importance, 0.9,
    { averageSpend: avg, invoiceCount: invoiceTotals.length },
  );
}

// ── Rule 3: Customer Unpaid Balance ──────────────────────────

export function ruleCustomerUnpaidBalance(
  shopId: string,
  customerId: string,
  unpaidCount: number,
  unpaidTotal: number,
): ReturnType<typeof partial> | null {
  if (unpaidCount === 0) return null;
  const importance: MemoryImportance = unpaidTotal >= 500 ? 'critical' : unpaidTotal >= 200 ? 'high' : 'medium';

  return partial(
    shopId, 'invoice_memory', 'customer', customerId,
    `${unpaidCount} unpaid invoice${unpaidCount === 1 ? '' : 's'} — $${unpaidTotal.toFixed(0)} outstanding`,
    'Revenue at risk — follow up required',
    importance, 1.0,
    { unpaidCount, unpaidTotal },
  );
}

// ── Rule 4: Declined Work ─────────────────────────────────────

export function ruleDeclinedWork(
  shopId: string,
  customerId: string,
  declinedEstimates: Array<{ id: string; title: string; total: number; declinedAt: string }>,
): ReturnType<typeof partial>[] {
  return declinedEstimates.map(e => {
    const days = daysSince(e.declinedAt) ?? 0;
    const importance: MemoryImportance = e.total >= 500 ? 'high' : 'medium';
    return partial(
      shopId, 'declined_work_memory', 'customer', customerId,
      `Declined work: ${e.title}`,
      `Declined ${days}d ago — $${e.total.toFixed(0)}. Revenue opportunity if rescheduled.`,
      importance, 0.85,
      { estimateId: e.id, total: e.total, daysSinceDecline: days },
    );
  });
}

// ── Rule 5: Vehicle Repeat Concern ───────────────────────────

export function ruleVehicleRepeatConcern(
  shopId: string,
  vehicleId: string,
  concerns: Array<{ category: string; count: number; lastSeen: string }>,
): ReturnType<typeof partial>[] {
  return concerns
    .filter(c => c.count >= 2)
    .map(c => {
      const importance: MemoryImportance = c.count >= 4 ? 'high' : 'medium';
      return partial(
        shopId, 'vehicle_memory', 'vehicle', vehicleId,
        `Repeat concern: ${c.category} (${c.count}x)`,
        `This vehicle has presented with ${c.category} issues ${c.count} times.`,
        importance, 0.9,
        { category: c.category, count: c.count, lastSeen: c.lastSeen },
      );
    });
}

// ── Rule 6: Vehicle Repair History ───────────────────────────

export function ruleVehicleRepairHistory(
  shopId: string,
  vehicleId: string,
  completedJobCount: number,
  repairCaseCount: number,
  firstServiceDate: string | null,
): ReturnType<typeof partial> | null {
  if (completedJobCount === 0 && repairCaseCount === 0) return null;
  const importance: MemoryImportance = completedJobCount >= 5 ? 'high' : 'medium';

  return partial(
    shopId, 'vehicle_memory', 'vehicle', vehicleId,
    `${completedJobCount} completed job${completedJobCount === 1 ? '' : 's'}, ${repairCaseCount} repair case${repairCaseCount === 1 ? '' : 's'}`,
    firstServiceDate ? `Vehicle first serviced ${daysSince(firstServiceDate) ?? 0}d ago` : null,
    importance, 0.95,
    { completedJobCount, repairCaseCount, firstServiceDate },
  );
}

// ── Rule 7: Comeback Risk ────────────────────────────────────

export function ruleVehicleComebackRisk(
  shopId: string,
  vehicleId: string,
  comebackCount: number,
  lastComebackDate: string | null,
): ReturnType<typeof partial> | null {
  if (comebackCount === 0) return null;
  const importance: MemoryImportance = comebackCount >= 2 ? 'critical' : 'high';

  return partial(
    shopId, 'comeback_memory', 'vehicle', vehicleId,
    `${comebackCount} comeback${comebackCount === 1 ? '' : 's'} recorded`,
    'Vehicle has returned after a repair — review repair quality.',
    importance, 0.9,
    { comebackCount, lastComebackDate },
  );
}

// ── Rule 8: Technician Strengths ─────────────────────────────

export function ruleTechnicianStrengths(
  shopId: string,
  technicianId: string,
  categoryStats: Array<{ category: string; verifiedCount: number }>,
): ReturnType<typeof partial>[] {
  return categoryStats
    .filter(s => s.verifiedCount >= 3)
    .map(s => {
      const importance: MemoryImportance = s.verifiedCount >= 10 ? 'high' : 'medium';
      return partial(
        shopId, 'technician_memory', 'technician', technicianId,
        `Strength: ${s.category} (${s.verifiedCount} verified repairs)`,
        null, importance, 0.85,
        { category: s.category, verifiedCount: s.verifiedCount },
      );
    });
}

// ── Rule 9: Parts Pattern ────────────────────────────────────

export function rulePartsPattern(
  shopId: string,
  partStats: Array<{ partId: string; partName: string; useCount: number; lastUsed: string }>,
): ReturnType<typeof partial>[] {
  return partStats
    .filter(p => p.useCount >= 3)
    .map(p => {
      const importance: MemoryImportance = p.useCount >= 10 ? 'high' : 'medium';
      return partial(
        shopId, 'parts_memory', 'part', p.partId,
        `Frequently used: ${p.partName} (${p.useCount}x)`,
        null, importance, 0.8,
        { partId: p.partId, partName: p.partName, useCount: p.useCount, lastUsed: p.lastUsed },
      );
    });
}

// ── Rule 10: Missing Repair Intelligence ─────────────────────

export function ruleMissingRepairIntelligence(
  shopId: string,
  jobsWithoutRepairCase: Array<{ jobId: string; completedAt: string }>,
): ReturnType<typeof partial>[] {
  return jobsWithoutRepairCase.map(j => {
    const days = daysSince(j.completedAt) ?? 0;
    return partial(
      shopId, 'repair_memory', 'job_card', j.jobId,
      `Completed job missing repair intelligence case`,
      `Job completed ${days}d ago — no repair case linked. Add one to build knowledge.`,
      'medium', 0.75,
      { jobId: j.jobId, daysSinceCompletion: days },
    );
  });
}

// ── Rule 11: Revenue Opportunity ─────────────────────────────

export function ruleRevenueOpportunity(
  shopId: string,
  staleEstimateCount: number,
  staleEstimateTotal: number,
  completedNotInvoicedCount: number,
  overdueInvoiceCount: number,
  overdueInvoiceTotal: number,
): ReturnType<typeof partial> | null {
  const totalOpportunity = staleEstimateTotal + overdueInvoiceTotal;
  if (totalOpportunity === 0 && completedNotInvoicedCount === 0) return null;

  const importance: MemoryImportance =
    totalOpportunity >= 1000 || completedNotInvoicedCount >= 5 ? 'critical' :
    totalOpportunity >= 500 ? 'high' : 'medium';

  const parts: string[] = [];
  if (staleEstimateCount > 0) parts.push(`${staleEstimateCount} stale estimate${staleEstimateCount === 1 ? '' : 's'} ($${staleEstimateTotal.toFixed(0)})`);
  if (completedNotInvoicedCount > 0) parts.push(`${completedNotInvoicedCount} completed job${completedNotInvoicedCount === 1 ? '' : 's'} not invoiced`);
  if (overdueInvoiceCount > 0) parts.push(`${overdueInvoiceCount} overdue invoice${overdueInvoiceCount === 1 ? '' : 's'} ($${overdueInvoiceTotal.toFixed(0)})`);

  return partial(
    shopId, 'revenue_memory', 'shop', null,
    `Revenue opportunity: $${totalOpportunity.toFixed(0)}`,
    parts.join(' · '),
    importance, 0.95,
    { staleEstimateCount, staleEstimateTotal, completedNotInvoicedCount, overdueInvoiceCount, overdueInvoiceTotal },
  );
}

// ── Rule 12: Shop Pattern ─────────────────────────────────────

export function ruleShopPattern(
  shopId: string,
  patterns: Array<{ category: string; vehicleCount: number; description: string }>,
): ReturnType<typeof partial>[] {
  return patterns
    .filter(p => p.vehicleCount >= 2)
    .map(p => {
      const importance: MemoryImportance = p.vehicleCount >= 5 ? 'high' : 'medium';
      return partial(
        shopId, 'shop_pattern_memory', 'shop', null,
        `Pattern: ${p.category} across ${p.vehicleCount} vehicles`,
        p.description,
        importance, 0.8,
        { category: p.category, vehicleCount: p.vehicleCount },
      );
    });
}
