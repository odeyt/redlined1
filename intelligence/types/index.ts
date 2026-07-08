// Intelligence Foundation — core types and interfaces
// No AI/LLM dependencies. All providers must implement IntelligenceProvider.

export interface IntelligenceEvent {
  eventId: string;
  eventType: string;
  shopId: string;
  userId: string;
  timestamp: string; // ISO 8601
  source: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface HealthStatus {
  provider: string;
  status: 'ok' | 'degraded' | 'offline';
  mockMode: boolean;
  lastEventAt: string | null;
  queueSize: number;
  environment: string;
  checkedAt: string;
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  category: string;
}

export interface DailySummaryData {
  shopId: string;
  date: string;
  shopHealth: 'good' | 'attention' | 'critical';
  revenue: { total: number; currency: string; invoiceCount: number };
  payments: { received: number; pending: number; overdue: number };
  estimates: { created: number; approved: number; declined: number; conversionRate: number };
  invoices: { created: number; paid: number; outstanding: number };
  repairOrders: { opened: number; completed: number; inProgress: number };
  inventoryAlerts: { lowStock: number; outOfStock: number };
  customerFollowUps: { count: number; overdue: number };
  technicianLoad: { active: number; totalHours: number };
  recommendations: Recommendation[];
  generatedAt: string;
  mockMode: boolean;
}

export interface MorningBriefingData {
  shopId: string;
  date: string;
  openRepairOrders: number;
  scheduledAppointments: number;
  overdueInvoices: number;
  lowInventoryItems: number;
  highlights: string[];
  generatedAt: string;
  mockMode: boolean;
}

export interface IntelligenceProvider {
  readonly name: string;
  publishEvent(event: IntelligenceEvent): Promise<void>;
  generateDailySummary(shopId: string, date: string): Promise<DailySummaryData>;
  generateMorningBriefing(shopId: string): Promise<MorningBriefingData>;
  getRecommendations(shopId: string): Promise<Recommendation[]>;
  health(): Promise<HealthStatus>;
}
