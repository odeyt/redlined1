// MockIntelligenceProvider — deterministic fake responses, no AI connected.
// This is the default provider. Clearly reports MOCK MODE in all responses.
import type {
  IntelligenceProvider,
  IntelligenceEvent,
  HealthStatus,
  DailySummaryData,
  MorningBriefingData,
  Recommendation,
} from '../types';
import { getLastEventAt, getQueueSize } from '../events/EventPublisher';

const MOCK_RECOMMENDATIONS: Recommendation[] = [
  {
    id: 'mock-1',
    title: 'MOCK MODE — No AI connected',
    description: 'Intelligence provider is running in mock mode. No real AI recommendations are available.',
    priority: 'low',
    category: 'system',
  },
];

export class MockIntelligenceProvider implements IntelligenceProvider {
  readonly name = 'mock';

  async publishEvent(_event: IntelligenceEvent): Promise<void> {
    // No-op in mock mode. Event is already logged by EventPublisher.
  }

  async generateDailySummary(shopId: string, date: string): Promise<DailySummaryData> {
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
      recommendations: MOCK_RECOMMENDATIONS,
      generatedAt: new Date().toISOString(),
      mockMode: true,
    };
  }

  async generateMorningBriefing(shopId: string): Promise<MorningBriefingData> {
    return {
      shopId,
      date: new Date().toISOString().slice(0, 10),
      openRepairOrders: 0,
      scheduledAppointments: 0,
      overdueInvoices: 0,
      lowInventoryItems: 0,
      highlights: ['MOCK MODE — No AI connected. Enable a real provider via INTELLIGENCE_PROVIDER env var.'],
      generatedAt: new Date().toISOString(),
      mockMode: true,
    };
  }

  async getRecommendations(_shopId: string): Promise<Recommendation[]> {
    return MOCK_RECOMMENDATIONS;
  }

  async health(): Promise<HealthStatus> {
    return {
      provider: this.name,
      status: 'ok',
      mockMode: true,
      lastEventAt: getLastEventAt(),
      queueSize: getQueueSize(),
      environment: process.env.NODE_ENV ?? 'unknown',
      checkedAt: new Date().toISOString(),
    };
  }
}
