// SI-7: Morning Brief Engine — Types
// Deterministic. No AI. No external calls.

export type MorningBriefStatus =
  | 'draft'
  | 'generated'
  | 'delivered'
  | 'dismissed'
  | 'archived';

export interface MorningBriefPriority {
  rank: number;
  title: string;
  category: string;
  recommendationKey: string;
  recommendationId: string;
  decisionScore: number;
  estimatedRevenue: number | null;
  estimatedTimeMinutes: number;
  whyItMatters: string;
  module: string | null;
}

export interface MorningBriefRevenueOpportunity {
  key: string;
  label: string;
  count: number;
  total: number | null;
  module: string;
  urgency: 'high' | 'medium' | 'low';
}

export interface MorningBriefRisk {
  key: string;
  label: string;
  count: number;
  detail: string | null;
  module: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface MorningBriefCashCollection {
  unpaidCount: number;
  unpaidTotal: number;
  overdueCount: number;
  overdueTotal: number;
  collectionUrgency: 'critical' | 'high' | 'medium' | 'low';
}

export interface MorningBriefTechnicianSummary {
  activeCount: number;
  idleCount: number;
  totalAssigned: number;
  bottlenecks: string[];
}

export interface MorningBriefInventorySummary {
  lowCount: number;
  criticalParts: string[];
  reorderUrgency: 'critical' | 'high' | 'medium' | 'low';
}

export interface MorningBriefYesterdaySummary {
  revenueYesterday: number;
  paymentsYesterday: number;
  jobsCompleted: number;
  repairCasesCreated: number;
  invoicesCreated: number;
}

export interface MorningBrief {
  id: string;
  shopId: string;
  briefDate: string;
  status: MorningBriefStatus;
  shopHealthScore: number;
  executiveScore: number;
  title: string;
  summary: string;
  yesterdaySummary: MorningBriefYesterdaySummary;
  todayPriorities: MorningBriefPriority[];
  revenueOpportunities: MorningBriefRevenueOpportunity[];
  cashCollection: MorningBriefCashCollection;
  operationalRisks: MorningBriefRisk[];
  technicianSummary: MorningBriefTechnicianSummary;
  inventorySummary: MorningBriefInventorySummary;
  recommendedFocus: string;
  metadata: Record<string, unknown>;
  generatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MorningBriefGenerationInput {
  shopId: string;
  date: string;
  metrics: Record<string, number | null>;
  rankedActions: MorningBriefPriority[];
  forceRegenerate?: boolean;
}

export interface MorningBriefGenerationResult {
  brief: MorningBrief;
  isNew: boolean;
  durationMs: number;
  warnings: string[];
}

export interface BriefDeliveryLog {
  id: string;
  shopId: string;
  morningBriefId: string;
  deliveryChannel: 'dashboard' | 'email' | 'sms' | 'whatsapp' | 'push';
  recipientUserId: string | null;
  recipientEmail: string | null;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  sentAt: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
