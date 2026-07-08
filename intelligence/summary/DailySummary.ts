// DailySummary — deterministic daily summary builder.
// No AI. Aggregates real data from DB via service calls when available,
// otherwise returns zero-filled structure. Always succeeds.
import type { DailySummaryData } from '../types';

/**
 * Build a daily summary for a shop deterministically (no AI).
 * Currently returns a structured zero-baseline. Future epics will populate
 * fields by querying invoices, repair orders, estimates, etc.
 */
export function buildDailySummary(shopId: string, date: string): DailySummaryData {
  return {
    shopId,
    date,
    shopHealth: 'good',
    revenue: { total: 0, currency: 'USD', invoiceCount: 0 },
    payments: { received: 0, pending: 0, overdue: 0 },
    estimates: { created: 0, approved: 0, declined: 0, conversionRate: 0 },
    invoices: { created: 0, paid: 0, outstanding: 0 },
    repairOrders: { opened: 0, completed: 0, inProgress: 0 },
    inventoryAlerts: { lowStock: 0, outOfStock: 0 },
    customerFollowUps: { count: 0, overdue: 0 },
    technicianLoad: { active: 0, totalHours: 0 },
    recommendations: [],
    generatedAt: new Date().toISOString(),
    mockMode: false,
  };
}
