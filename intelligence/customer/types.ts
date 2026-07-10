// SI-13: Customer Lifetime Intelligence — Core Types

export type CustomerProfileStatus = 'unavailable' | 'limited' | 'building' | 'ready' | 'stale' | 'error';

export type CustomerSegmentKey =
  | 'vip' | 'high_value' | 'loyal' | 'fleet' | 'commercial'
  | 'frequent' | 'new_customer' | 'occasional' | 'price_sensitive'
  | 'inactive' | 'at_risk' | 'lost' | 'unresolved_declined_work'
  | 'outstanding_balance' | 'maintenance_opportunity' | 'limited_data';

export type CustomerRetentionRisk = 'low' | 'moderate' | 'high' | 'critical' | 'unknown';
export type CustomerRelationshipStatus = 'excellent' | 'strong' | 'stable' | 'weak' | 'at_risk' | 'unknown';
export type CustomerChurnRisk = CustomerRetentionRisk;

export interface CustomerSegment {
  id: string;
  shopId: string;
  customerId: string;
  segmentKey: CustomerSegmentKey;
  segmentLabel: string;
  segmentReason: string | null;
  confidence: number;
  evidence: CustomerEvidence[];
  isPrimary: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerEvidence {
  source: string;
  sourceType: string;
  entityId?: string;
  entityType?: string;
  description: string;
  value?: number | string;
  date?: string;
  confidence: number;
}

export interface CustomerIntelligenceSignal {
  id: string;
  shopId: string;
  customerId: string;
  signalKey: string;
  signalType: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string | null;
  confidence: number;
  estimatedRevenue: number | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  evidence: CustomerEvidence[];
  metadata: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerIntelligenceEvent {
  id: string;
  shopId: string;
  customerId: string;
  eventType: string;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  eventDate: string;
  title: string | null;
  summary: string | null;
  amount: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CustomerOpportunityOutcome {
  id: string;
  shopId: string;
  customerId: string;
  signalId: string | null;
  opportunityType: string;
  outcomeStatus: 'pending' | 'contacted' | 'scheduled' | 'converted' | 'declined' | 'dismissed' | 'expired' | 'no_response' | 'successful' | 'unsuccessful';
  expectedRevenue: number | null;
  realizedRevenue: number | null;
  actionTaken: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerLifetimeProfile {
  id: string;
  shopId: string;
  customerId: string;
  profileStatus: CustomerProfileStatus;
  customerSince: string | null;
  lastVisitAt: string | null;
  firstVisitAt: string | null;
  visitCount: number;
  activeVehicleCount: number;
  completedJobCount: number;
  estimateCount: number;
  approvedEstimateCount: number;
  declinedEstimateCount: number;
  invoiceCount: number;
  paidInvoiceCount: number;
  unpaidInvoiceCount: number;
  unpaidBalance: number;
  lifetimeRevenue: number;
  averageInvoiceValue: number;
  averageDaysBetweenVisits: number | null;
  approvalRate: number | null;
  declineRate: number | null;
  paymentReliabilityScore: number | null;
  retentionScore: number | null;
  relationshipScore: number | null;
  customerSegment: CustomerSegmentKey | null;
  churnRisk: CustomerChurnRisk | null;
  predictedNextVisitStart: string | null;
  predictedNextVisitEnd: string | null;
  nextBestOpportunities: CustomerRevenueOpportunity[];
  unresolvedDeclinedWork: DeclinedWorkRecord[];
  activeRisks: CustomerRiskItem[];
  importantMemories: string[];
  metadata: Record<string, unknown>;
  calculatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeclinedWorkRecord {
  description: string;
  estimatedValue: number | null;
  declinedDate: string | null;
  reason: string | null;
}

export interface CustomerRiskItem {
  riskKey: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  confidence: number;
}

export interface CustomerRevenueOpportunity {
  opportunityType: string;
  title: string;
  reason: string;
  evidence: CustomerEvidence[];
  expectedRevenue: number | null;
  confidence: number;
  recommendedAction: string;
  disclaimer: string;
  dataQuality: string;
}

export interface CustomerRetentionRiskResult {
  risk: CustomerRetentionRisk;
  baseScore: number;
  positiveFactors: RetentionFactor[];
  negativeFactors: RetentionFactor[];
  finalScore: number;
  confidence: number;
  dataQuality: string;
  suggestedActions: RetentionAction[];
  calculatedAt: string;
}

export interface RetentionFactor {
  key: string;
  label: string;
  impact: number;
}

export interface RetentionAction {
  actionType: string;
  label: string;
  priority: 'high' | 'medium' | 'low';
}

export interface CustomerRelationshipScore {
  score: number;
  status: CustomerRelationshipStatus;
  positiveFactors: RetentionFactor[];
  negativeFactors: RetentionFactor[];
  confidence: number;
  dataQuality: string;
  calculatedAt: string;
}

export interface CustomerPaymentReliability {
  score: number | null;
  paidPercentage: number | null;
  unpaidCount: number;
  unpaidBalance: number;
  dataQuality: string;
  disclaimer: string;
  calculatedAt: string;
}

export interface CustomerVisitPattern {
  visitCount: number;
  firstVisit: string | null;
  lastVisit: string | null;
  averageDaysBetweenVisits: number | null;
  visitFrequencyTrend: 'increasing' | 'stable' | 'decreasing' | 'unknown';
  daysOverdue: number | null;
  dataQuality: string;
}

export interface CustomerTimelineItem {
  id: string;
  eventType: string;
  eventDate: string;
  title: string;
  summary: string | null;
  amount: number | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
}

export interface CustomerLifetimeContext {
  shopId: string;
  customerId: string;
  customer: RawCustomerRow | null;
  vehicles: VehicleRow[];
  jobHistory: JobCardRow[];
  estimateHistory: EstimateRow[];
  invoiceHistory: InvoiceRow[];
  declinedWork: DeclinedWorkRow[];
  appointmentHistory: AppointmentRow[];
  businessMemorySummary: string | null;
  vehicleIntelligenceSummary: string | null;
  serviceAdvisorHistory: ServiceAdvisorSessionRow[];
  dataQualityWarnings: string[];
  builtAt: string;
}

export interface RawCustomerRow {
  id: string;
  shopId: string;
  createdAt: string;
  visitCount?: number;
  lastVisitDate?: string | null;
  isFleet?: boolean;
  isCommercial?: boolean;
  notes?: string | null;
}

export interface VehicleRow {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  isActive: boolean;
}

export interface JobCardRow {
  id: string;
  createdAt: string;
  status: string | null;
  completedAt: string | null;
}

export interface EstimateRow {
  id: string;
  totalAmount: number | null;
  currency: string | null;
  status: string | null;
  approvedAt: string | null;
  declinedAt: string | null;
  createdAt: string;
}

export interface InvoiceRow {
  id: string;
  totalAmount: number | null;
  status: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface DeclinedWorkRow {
  id: string;
  description: string;
  estimatedValue: number | null;
  declinedAt: string | null;
  reason: string | null;
}

export interface AppointmentRow {
  id: string;
  scheduledAt: string | null;
  status: string | null;
  createdAt: string;
}

export interface ServiceAdvisorSessionRow {
  id: string;
  sessionStatus: string;
  createdAt: string;
  estimateQualityScore: number | null;
}

export interface CustomerBuildResult {
  profile: CustomerLifetimeProfile;
  segments: CustomerSegment[];
  signals: CustomerIntelligenceSignal[];
  retentionRisk: CustomerRetentionRiskResult;
  relationshipScore: CustomerRelationshipScore;
  paymentReliability: CustomerPaymentReliability;
  opportunities: CustomerRevenueOpportunity[];
  timeline: CustomerTimelineItem[];
  dataQualityWarnings: string[];
  engineErrors: string[];
  builtAt: string;
}

export interface CustomerDataQuality {
  hasVisitHistory: boolean;
  hasInvoiceHistory: boolean;
  hasEstimateHistory: boolean;
  hasVehicles: boolean;
  sampleSize: number;
  confidenceLevel: 'high' | 'medium' | 'low' | 'insufficient';
  warnings: string[];
}

export interface CustomerHealthStatus {
  healthy: boolean;
  totalProfiles: number;
  readyProfiles: number;
  limitedProfiles: number;
  staleProfiles: number;
  errorProfiles: number;
  lastCalculatedAt: string | null;
}
