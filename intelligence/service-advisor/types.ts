// SI-12: Intelligent Service Advisor — Core Types

export type ServiceAdvisorSessionStatus =
  | 'draft'
  | 'generated'
  | 'reviewed'
  | 'completed'
  | 'dismissed'
  | 'stale'
  | 'error';

export type ServiceAdvisorSuggestionType =
  | 'missing_information'
  | 'estimate_quality'
  | 'customer_explanation'
  | 'follow_up'
  | 'declined_work'
  | 'related_service'
  | 'maintenance_review'
  | 'warranty_risk'
  | 'duplicate_item_warning'
  | 'labor_review'
  | 'parts_review'
  | 'safety_review'
  | 'customer_history'
  | 'vehicle_history';

export type ServiceAdvisorSuggestionStatus =
  | 'open'
  | 'accepted'
  | 'dismissed'
  | 'completed'
  | 'expired';

export type ServiceAdvisorSuggestionPriority = 'critical' | 'high' | 'medium' | 'low';

export type AdvisorOutcomeType =
  | 'suggestion_reviewed'
  | 'suggestion_accepted'
  | 'suggestion_dismissed'
  | 'estimate_sent'
  | 'estimate_approved'
  | 'estimate_declined'
  | 'follow_up_completed'
  | 'explanation_used'
  | 'no_measurable_outcome';

export interface AdvisorEvidence {
  source: string;
  sourceType: 'inspection' | 'declined_work' | 'invoice' | 'repair_case' | 'vehicle_intelligence' | 'business_memory' | 'knowledge_graph' | 'internal';
  entityId?: string;
  entityType?: string;
  description: string;
  date?: string;
  confidence: number;
}

export interface ServiceAdvisorSuggestion {
  id: string;
  shopId: string;
  advisorSessionId: string | null;
  suggestionType: ServiceAdvisorSuggestionType;
  suggestionKey: string;
  priority: ServiceAdvisorSuggestionPriority;
  title: string;
  explanation: string | null;
  reason: string | null;
  estimatedRevenue: number | null;
  confidence: number;
  evidence: AdvisorEvidence[];
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  actionType: string | null;
  actionPayload: Record<string, unknown>;
  status: ServiceAdvisorSuggestionStatus;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  dismissedAt: string | null;
}

export interface ServiceAdvisorSession {
  id: string;
  shopId: string;
  customerId: string | null;
  vehicleId: string | null;
  jobCardId: string | null;
  estimateId: string | null;
  sessionStatus: ServiceAdvisorSessionStatus;
  contextSnapshot: ServiceAdvisorContext | null;
  estimateQualityScore: number | null;
  approvalOpportunityScore: number | null;
  advisorSummary: string | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CustomerContext {
  customerId: string;
  visitCount: number;
  lastVisitDate: string | null;
  averageInvoiceValue: number | null;
  unpaidBalance: number | null;
  approvalHistoryRate: number | null;
  priorDeclinedCount: number;
  priorDeclinedItems: DeclinedWorkItem[];
  repeatConcerns: string[];
}

export interface VehicleContext {
  vehicleId: string;
  year: number | null;
  make: string | null;
  model: string | null;
  mileage: number | null;
  repairHistorySummary: string[];
  activeDtcCodes: string[];
  lastServiceDate: string | null;
  vehicleIntelligenceSignals: VehicleIntelligenceSignal[];
}

export interface VehicleIntelligenceSignal {
  signalType: string;
  description: string;
  severity: string | null;
  confidence: number;
}

export interface InspectionContext {
  inspectionId: string | null;
  findings: InspectionFinding[];
  completedAt: string | null;
  technicianNotes: string | null;
}

export interface InspectionFinding {
  id: string;
  category: string;
  name: string;
  condition: string | null;
  notes: string | null;
  isSafety: boolean;
  hasEstimateLine: boolean;
}

export interface EstimateContext {
  estimateId: string;
  status: string | null;
  totalAmount: number | null;
  currency: string | null;
  lineCount: number;
  lines: EstimateLine[];
  hasCustomerExplanation: boolean;
  sentAt: string | null;
  viewedAt: string | null;
  approvedAt: string | null;
  declinedAt: string | null;
  createdAt: string | null;
  hasLinkedInspection: boolean;
}

export interface EstimateLine {
  id: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
  currency: string | null;
  lineType: 'labor' | 'part' | 'sublet' | 'fee' | 'other' | null;
  inspectionFindingId: string | null;
}

export interface DeclinedWorkItem {
  serviceId: string | null;
  description: string;
  estimatedValue: number | null;
  declinedDate: string | null;
  reason: string | null;
}

export interface ServiceAdvisorContext {
  shopId: string;
  sessionId: string | null;
  customer: CustomerContext | null;
  vehicle: VehicleContext | null;
  inspection: InspectionContext | null;
  estimate: EstimateContext | null;
  jobCardConcern: string | null;
  businessMemorySummary: string | null;
  repairIntelligenceSummary: string | null;
  dataQualityWarnings: string[];
  builtAt: string;
}

export interface EstimateQualityIssue {
  ruleKey: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  affectedLineId: string | null;
  recommendation: string;
}

export interface EstimateQualityReview {
  estimateId: string;
  qualityScore: number;
  issues: EstimateQualityIssue[];
  checkedAt: string;
  dataQualityWarning: string | null;
}

export interface RelatedServiceSuggestion {
  suggestionKey: string;
  title: string;
  relevanceReason: string;
  evidence: AdvisorEvidence[];
  confidence: number;
  estimatedRevenue: number | null;
  requiresInspectionConfirmation: boolean;
  disclaimer: string;
}

export interface CustomerExplanation {
  estimateId: string | null;
  overview: string;
  findingExplanations: FindingExplanationItem[];
  safetyItems: string[];
  declinedWorkReminders: string[];
  plainLanguageSummary: string;
  language: string;
  isEditable: true;
  generatedAt: string;
  disclaimer: string;
}

export interface FindingExplanationItem {
  findingId: string | null;
  findingName: string;
  whatWasFound: string;
  whyItMatters: string;
  recommendation: string;
  consequenceIfIgnored: string | null;
  isSafety: boolean;
}

export interface FollowUpRecommendation {
  estimateId: string;
  estimateAge: number;
  estimateValue: number | null;
  priority: ServiceAdvisorSuggestionPriority;
  reason: string;
  suggestedActions: FollowUpAction[];
  opportunityScore: ApprovalOpportunity;
}

export interface FollowUpAction {
  actionType: 'open_estimate' | 'call_customer' | 'prepare_follow_up' | 'review_lower_cost_option' | 'schedule_approved_work' | 'dismiss' | 'mark_complete';
  label: string;
  payload: Record<string, unknown>;
}

export interface ApprovalOpportunity {
  estimateId: string;
  baseScore: number;
  positiveFactors: OpportunityFactor[];
  negativeFactors: OpportunityFactor[];
  finalScore: number;
  dataQualityWarning: string | null;
  calculatedAt: string;
}

export interface OpportunityFactor {
  key: string;
  label: string;
  impact: number;
}

export interface AdvisorTemplate {
  id: string;
  shopId: string | null;
  templateKey: string;
  templateType: string;
  name: string;
  content: string;
  language: string;
  isSystem: boolean;
  isActive: boolean;
  metadata: Record<string, unknown>;
}

export interface AdvisorBuildResult {
  session: ServiceAdvisorSession;
  qualityReview: EstimateQualityReview | null;
  suggestions: ServiceAdvisorSuggestion[];
  customerExplanation: CustomerExplanation | null;
  followUpRecommendations: FollowUpRecommendation[];
  dataQualityWarnings: string[];
  engineErrors: string[];
  builtAt: string;
}

export interface AdvisorHealthStatus {
  healthy: boolean;
  sessionCount: number;
  openSuggestionCount: number;
  acceptedSuggestionCount: number;
  dismissedSuggestionCount: number;
  engineErrors: string[];
  lastCalculatedAt: string | null;
}

export interface CreateAdvisorSessionInput {
  shopId: string;
  customerId?: string;
  vehicleId?: string;
  jobCardId?: string;
  estimateId?: string;
  createdBy?: string;
}

export interface RecordAdvisorOutcomeInput {
  shopId: string;
  advisorSessionId?: string;
  estimateId?: string;
  suggestionId?: string;
  outcomeType: AdvisorOutcomeType;
  accepted?: boolean;
  estimateApproved?: boolean;
  realizedRevenue?: number;
  customerResponse?: string;
  recordedBy?: string;
  metadata?: Record<string, unknown>;
}
