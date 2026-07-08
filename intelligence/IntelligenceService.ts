// IntelligenceService — public façade. Use this everywhere in the app.
// Never import providers or EventPublisher directly from application code.
import { getProvider } from './provider/factory';
import { queue } from './events/EventPublisher';
import { buildDailySummary } from './summary/DailySummary';
import type { EventType } from './events/eventTypes';
import type { DailySummaryData, MorningBriefingData, Recommendation, HealthStatus } from './types';

/**
 * Publish an intelligence event. Fire-and-forget — never throws.
 * Guard with intelligence_foundation feature flag before calling.
 */
export function publishEvent(
  eventType: EventType,
  shopId: string,
  userId: string,
  entityType: string,
  entityId: string,
  payload?: Record<string, unknown>,
): void {
  try {
    queue(eventType, shopId, userId, entityType, entityId, payload);
  } catch {
    // Never propagate — intelligence is non-critical infrastructure
  }
}

/**
 * Build a daily summary. Falls back to deterministic zero-baseline if provider fails.
 */
export async function buildDailySummaryFor(shopId: string, date: string): Promise<DailySummaryData> {
  try {
    return await getProvider().generateDailySummary(shopId, date);
  } catch {
    return buildDailySummary(shopId, date);
  }
}

/**
 * Generate a morning briefing. Returns mock data if provider fails.
 */
export async function generateMorningBrief(shopId: string): Promise<MorningBriefingData> {
  try {
    return await getProvider().generateMorningBriefing(shopId);
  } catch {
    return {
      shopId,
      date: new Date().toISOString().slice(0, 10),
      openRepairOrders: 0,
      scheduledAppointments: 0,
      overdueInvoices: 0,
      lowInventoryItems: 0,
      highlights: [],
      generatedAt: new Date().toISOString(),
      mockMode: true,
    };
  }
}

/**
 * Get recommendations. Returns empty array if provider fails.
 */
export async function getRecommendations(shopId: string): Promise<Recommendation[]> {
  try {
    return await getProvider().getRecommendations(shopId);
  } catch {
    return [];
  }
}

/**
 * Health check. Always returns a valid HealthStatus — never throws.
 */
export async function getHealth(): Promise<HealthStatus> {
  try {
    return await getProvider().health();
  } catch {
    return {
      provider: 'unknown',
      status: 'offline',
      mockMode: true,
      lastEventAt: null,
      queueSize: 0,
      environment: process.env.NODE_ENV ?? 'unknown',
      checkedAt: new Date().toISOString(),
    };
  }
}
