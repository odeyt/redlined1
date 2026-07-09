// SI-8: Sapelee Intelligence Provider
// Implements the IntelligenceProvider interface via Sapelee API.
// Falls back to MockIntelligenceProvider on any failure — never throws to caller.

import type {
  IntelligenceProvider,
  IntelligenceEvent,
  HealthStatus,
  DailySummaryData,
  MorningBriefingData,
  Recommendation,
} from '@/intelligence/types';
import { MockIntelligenceProvider } from '@/intelligence/mock/MockIntelligenceProvider';
import {
  sendEvent,
  requestMorningBriefEnhancement,
  requestExecutiveAdvice,
  getHealth as getSapeleeHealth,
  isSapeleeReachable,
} from './SapeleeClient';
import { buildEventPayload } from './SapeleePayloadBuilder';

const _mock = new MockIntelligenceProvider();

export class SapeleeIntelligenceProvider implements IntelligenceProvider {
  readonly name = 'sapelee';

  /**
   * Publish an anonymized operational event to Sapelee.
   * Never blocks caller — fire-and-forget with PII redaction.
   */
  async publishEvent(event: IntelligenceEvent): Promise<void> {
    try {
      const safePayload = buildEventPayload(
        event.eventType,
        event.shopId,
        event.entityType,
        event.entityId,
        event.payload,
      );
      void sendEvent(safePayload);
    } catch {
      // Never propagate — intelligence is non-critical
    }
  }

  /**
   * Generate a daily summary.
   * Attempts Sapelee executive advice, falls back to mock on any failure.
   */
  async generateDailySummary(shopId: string, date: string): Promise<DailySummaryData> {
    try {
      const reachable = await isSapeleeReachable();
      if (!reachable) return _mock.generateDailySummary(shopId, date);

      const advice = await requestExecutiveAdvice({ shopId, date, type: 'daily_summary' });
      if (advice.mockMode || !advice.summary) return _mock.generateDailySummary(shopId, date);

      const base = await _mock.generateDailySummary(shopId, date);
      return {
        ...base,
        mockMode: false,
        recommendations: advice.topActions.map((title, i) => ({
          id:          `sapelee-${i}`,
          title,
          description: '',
          priority:    'medium' as const,
          category:    'sapelee',
        })),
      };
    } catch {
      return _mock.generateDailySummary(shopId, date);
    }
  }

  /**
   * Generate a morning briefing.
   * Returns SI-7 local brief wrapped in MorningBriefingData shape.
   * Enhancement is applied separately in MorningBriefEngine (SI-7 integration point).
   */
  async generateMorningBriefing(shopId: string): Promise<MorningBriefingData> {
    try {
      return await _mock.generateMorningBriefing(shopId);
    } catch {
      return _mock.generateMorningBriefing(shopId);
    }
  }

  /**
   * Get recommendations. Falls back to mock on failure.
   */
  async getRecommendations(shopId: string): Promise<Recommendation[]> {
    try {
      const reachable = await isSapeleeReachable();
      if (!reachable) return _mock.getRecommendations(shopId);

      const advice = await requestExecutiveAdvice({ shopId, type: 'recommendations' });
      if (advice.mockMode || advice.topActions.length === 0)
        return _mock.getRecommendations(shopId);

      return advice.topActions.map((title, i) => ({
        id:          `sapelee-rec-${i}`,
        title,
        description: '',
        priority:    'medium' as const,
        category:    'sapelee',
      }));
    } catch {
      return _mock.getRecommendations(shopId);
    }
  }

  /**
   * Health check. Includes Sapelee connectivity status.
   */
  async health(): Promise<HealthStatus> {
    try {
      const sapeleeHealth = await getSapeleeHealth();
      const { getLastEventAt, getQueueSize } = await import('@/intelligence/events/EventPublisher');
      return {
        provider:    this.name,
        status:      sapeleeHealth.status === 'ok' ? 'ok' : 'degraded',
        mockMode:    !sapeleeHealth.configured,
        lastEventAt: getLastEventAt(),
        queueSize:   getQueueSize(),
        environment: process.env.NODE_ENV ?? 'unknown',
        checkedAt:   new Date().toISOString(),
      };
    } catch {
      return {
        provider:    this.name,
        status:      'degraded',
        mockMode:    true,
        lastEventAt: null,
        queueSize:   0,
        environment: process.env.NODE_ENV ?? 'unknown',
        checkedAt:   new Date().toISOString(),
      };
    }
  }
}

/**
 * Enhance a morning brief with Sapelee executive insight.
 * Called from MorningBriefEngine when sapelee_morning_brief_enhancement flag is ON.
 * Returns null if Sapelee unavailable — caller keeps local brief unchanged.
 */
export async function enhanceMorningBriefWithSapelee(
  briefPayload: unknown,
): Promise<import('./SapeleeClient').SapeleeBriefEnhancement | null> {
  try {
    const enhancement = await requestMorningBriefEnhancement(briefPayload);
    if (enhancement.mockMode || !enhancement.executiveSummary) return null;
    return enhancement;
  } catch {
    return null;
  }
}
