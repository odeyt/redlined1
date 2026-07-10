// SI-13: Customer Lifetime Intelligence — Main Orchestrator

import { supabase } from '@/lib/supabase';
import { buildCustomerContext } from './CustomerContextBuilder';
import { scoreCustomerRelationship } from './CustomerRelationshipScoring';
import { assessRetentionRisk } from './CustomerRetentionRiskEngine';
import { classifyCustomerSegments, toCustomerSegments, getPrimarySegment } from './CustomerSegmentationEngine';
import { findCustomerOpportunities } from './CustomerOpportunityEngine';
import { buildCustomerTimeline } from './CustomerTimelineEngine';
import type {
  CustomerBuildResult,
  CustomerLifetimeProfile,
  CustomerLifetimeContext,
  CustomerHealthStatus,
  CustomerPaymentReliability,
  CustomerDataQuality,
  CustomerRelationshipScore,
  CustomerRetentionRiskResult,
  CustomerRevenueOpportunity,
  CustomerTimelineItem,
  CustomerSegment,
  CustomerIntelligenceSignal,
} from './types';

// ── Build / Rebuild Profile ────────────────────────────────────────────────────

export async function buildCustomerProfile(shopId: string, customerId: string): Promise<CustomerBuildResult> {
  const engineErrors: string[] = [];
  const builtAt = new Date().toISOString();

  const ctx = await buildCustomerContext(shopId, customerId);

  let relationshipScore: CustomerRelationshipScore = { score: 0, status: 'unknown', positiveFactors: [], negativeFactors: [], confidence: 0, dataQuality: 'insufficient_data', calculatedAt: builtAt };
  try { relationshipScore = scoreCustomerRelationship(ctx); } catch (e) { engineErrors.push(`relationship_scoring: ${String(e)}`); }

  let retentionRisk: CustomerRetentionRiskResult = { risk: 'unknown', baseScore: 50, positiveFactors: [], negativeFactors: [], finalScore: 50, confidence: 0, dataQuality: 'insufficient_data', suggestedActions: [], calculatedAt: builtAt };
  try { retentionRisk = assessRetentionRisk(ctx); } catch (e) { engineErrors.push(`retention_risk: ${String(e)}`); }

  let segmentCandidates: ReturnType<typeof classifyCustomerSegments> = [];
  try { segmentCandidates = classifyCustomerSegments(ctx, shopId, customerId); } catch (e) { engineErrors.push(`segmentation: ${String(e)}`); }

  let opportunities: CustomerRevenueOpportunity[] = [];
  try { opportunities = findCustomerOpportunities(ctx); } catch (e) { engineErrors.push(`opportunities: ${String(e)}`); }

  let timeline: CustomerTimelineItem[] = [];
  try { timeline = buildCustomerTimeline(ctx); } catch (e) { engineErrors.push(`timeline: ${String(e)}`); }

  const paymentReliability = buildPaymentReliability(ctx, builtAt);
  const dataQuality = assessDataQuality(ctx);
  const primarySegment = getPrimarySegment(segmentCandidates);

  const visitCount = ctx.jobHistory.length;
  const activeVehicles = ctx.vehicles.filter(v => v.isActive).length;
  const invoices = ctx.invoiceHistory;
  const paidInvoices = invoices.filter(i => i.paidAt);
  const unpaidInvoices = invoices.filter(i => !i.paidAt && i.status !== 'void' && i.status !== 'cancelled');
  const lifetimeRevenue = paidInvoices.reduce((s, i) => s + (i.totalAmount ?? 0), 0);
  const unpaidBalance = unpaidInvoices.reduce((s, i) => s + (i.totalAmount ?? 0), 0);
  const avgInvoice = paidInvoices.length > 0 ? lifetimeRevenue / paidInvoices.length : 0;
  const approvedEst = ctx.estimateHistory.filter(e => e.approvedAt).length;
  const declinedEst = ctx.estimateHistory.filter(e => e.declinedAt).length;
  const totalEst = ctx.estimateHistory.length;

  // Average days between visits
  let avgDaysBetweenVisits: number | null = null;
  if (visitCount >= 2) {
    const sortedJobs = [...ctx.jobHistory].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const gaps: number[] = [];
    for (let i = 1; i < sortedJobs.length; i++) {
      gaps.push((new Date(sortedJobs[i].createdAt).getTime() - new Date(sortedJobs[i - 1].createdAt).getTime()) / 86400000);
    }
    avgDaysBetweenVisits = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  }

  // Predicted next visit window
  let predictedNextVisitStart: string | null = null;
  let predictedNextVisitEnd: string | null = null;
  if (avgDaysBetweenVisits !== null && ctx.jobHistory[0]) {
    const lastVisit = new Date(ctx.jobHistory[0].createdAt);
    const predictedCenter = new Date(lastVisit.getTime() + avgDaysBetweenVisits * 86400000);
    const window = Math.min(avgDaysBetweenVisits * 0.25, 30);
    predictedNextVisitStart = new Date(predictedCenter.getTime() - window * 86400000).toISOString().split('T')[0];
    predictedNextVisitEnd = new Date(predictedCenter.getTime() + window * 86400000).toISOString().split('T')[0];
  }

  const profileStatus = dataQuality.confidenceLevel === 'insufficient' ? 'limited'
    : dataQuality.confidenceLevel === 'low' ? 'building'
    : 'ready';

  const profile: CustomerLifetimeProfile = {
    id: '',
    shopId,
    customerId,
    profileStatus,
    customerSince: ctx.customer?.createdAt ?? null,
    lastVisitAt: ctx.jobHistory[0]?.completedAt ?? ctx.jobHistory[0]?.createdAt ?? null,
    firstVisitAt: ctx.jobHistory.length > 0 ? ctx.jobHistory[ctx.jobHistory.length - 1].createdAt : null,
    visitCount,
    activeVehicleCount: activeVehicles,
    completedJobCount: ctx.jobHistory.filter(j => j.status === 'completed').length,
    estimateCount: totalEst,
    approvedEstimateCount: approvedEst,
    declinedEstimateCount: declinedEst,
    invoiceCount: invoices.length,
    paidInvoiceCount: paidInvoices.length,
    unpaidInvoiceCount: unpaidInvoices.length,
    unpaidBalance,
    lifetimeRevenue,
    averageInvoiceValue: Math.round(avgInvoice * 100) / 100,
    averageDaysBetweenVisits: avgDaysBetweenVisits !== null ? Math.round(avgDaysBetweenVisits) : null,
    approvalRate: totalEst >= 2 ? Math.round((approvedEst / totalEst) * 100) / 100 : null,
    declineRate: totalEst >= 2 ? Math.round((declinedEst / totalEst) * 100) / 100 : null,
    paymentReliabilityScore: paymentReliability.score,
    retentionScore: retentionRisk.finalScore,
    relationshipScore: relationshipScore.score,
    customerSegment: primarySegment,
    churnRisk: retentionRisk.risk,
    predictedNextVisitStart,
    predictedNextVisitEnd,
    nextBestOpportunities: opportunities,
    unresolvedDeclinedWork: ctx.declinedWork.map(d => ({
      description: d.description,
      estimatedValue: d.estimatedValue,
      declinedDate: d.declinedAt,
      reason: d.reason,
    })),
    activeRisks: retentionRisk.risk !== 'low' && retentionRisk.risk !== 'unknown'
      ? [{
          riskKey: `retention_${retentionRisk.risk}`,
          severity: retentionRisk.risk === 'critical' ? 'critical' : retentionRisk.risk === 'high' ? 'warning' : 'info',
          title: `Retention risk: ${retentionRisk.risk}`,
          description: retentionRisk.negativeFactors.map(f => f.label).join(', ') || 'See retention score details.',
          confidence: retentionRisk.confidence,
        }]
      : [],
    importantMemories: ctx.businessMemorySummary ? [ctx.businessMemorySummary] : [],
    metadata: {},
    calculatedAt: builtAt,
    createdAt: builtAt,
    updatedAt: builtAt,
  };

  const segments: CustomerSegment[] = toCustomerSegments(segmentCandidates, shopId, customerId).map((s, i) => ({
    ...s,
    id: `seg_${i}`,
    createdAt: builtAt,
    updatedAt: builtAt,
  }));

  const signals: CustomerIntelligenceSignal[] = buildSignals(ctx, profile, shopId, customerId, builtAt);

  // Persist profile (upsert)
  void supabase.from('customer_lifetime_profiles').upsert({
    shop_id: shopId,
    customer_id: customerId,
    profile_status: profile.profileStatus,
    customer_since: profile.customerSince,
    last_visit_at: profile.lastVisitAt,
    first_visit_at: profile.firstVisitAt,
    visit_count: profile.visitCount,
    active_vehicle_count: profile.activeVehicleCount,
    completed_job_count: profile.completedJobCount,
    estimate_count: profile.estimateCount,
    approved_estimate_count: profile.approvedEstimateCount,
    declined_estimate_count: profile.declinedEstimateCount,
    invoice_count: profile.invoiceCount,
    paid_invoice_count: profile.paidInvoiceCount,
    unpaid_invoice_count: profile.unpaidInvoiceCount,
    unpaid_balance: profile.unpaidBalance,
    lifetime_revenue: profile.lifetimeRevenue,
    average_invoice_value: profile.averageInvoiceValue,
    average_days_between_visits: profile.averageDaysBetweenVisits,
    approval_rate: profile.approvalRate,
    decline_rate: profile.declineRate,
    payment_reliability_score: profile.paymentReliabilityScore,
    retention_score: profile.retentionScore,
    relationship_score: profile.relationshipScore,
    customer_segment: profile.customerSegment,
    churn_risk: profile.churnRisk,
    predicted_next_visit_start: profile.predictedNextVisitStart,
    predicted_next_visit_end: profile.predictedNextVisitEnd,
    next_best_opportunities: profile.nextBestOpportunities,
    unresolved_declined_work: profile.unresolvedDeclinedWork,
    active_risks: profile.activeRisks,
    important_memories: profile.importantMemories,
    metadata: profile.metadata,
    calculated_at: builtAt,
    updated_at: builtAt,
  }, { onConflict: 'shop_id,customer_id' });

  return {
    profile,
    segments,
    signals,
    retentionRisk,
    relationshipScore,
    paymentReliability,
    opportunities,
    timeline,
    dataQualityWarnings: [...ctx.dataQualityWarnings, ...dataQuality.warnings],
    engineErrors,
    builtAt,
  };
}

export async function getCustomerProfile(shopId: string, customerId: string): Promise<CustomerLifetimeProfile | null> {
  const { data } = await supabase
    .from('customer_lifetime_profiles')
    .select('*')
    .eq('shop_id', shopId)
    .eq('customer_id', customerId)
    .maybeSingle();

  if (!data) return null;
  return mapProfileRow(data);
}

export async function getCustomerSegments(shopId: string, customerId: string): Promise<CustomerSegment[]> {
  const { data } = await supabase
    .from('customer_segments')
    .select('*')
    .eq('shop_id', shopId)
    .eq('customer_id', customerId)
    .eq('is_active', true);
  return (data ?? []).map(mapSegmentRow);
}

export async function getCustomerHealth(shopId: string): Promise<CustomerHealthStatus> {
  try {
    const [total, ready, limited, stale, error] = await Promise.all([
      supabase.from('customer_lifetime_profiles').select('*', { count: 'exact', head: true }).eq('shop_id', shopId),
      supabase.from('customer_lifetime_profiles').select('*', { count: 'exact', head: true }).eq('shop_id', shopId).eq('profile_status', 'ready'),
      supabase.from('customer_lifetime_profiles').select('*', { count: 'exact', head: true }).eq('shop_id', shopId).eq('profile_status', 'limited'),
      supabase.from('customer_lifetime_profiles').select('*', { count: 'exact', head: true }).eq('shop_id', shopId).eq('profile_status', 'stale'),
      supabase.from('customer_lifetime_profiles').select('*', { count: 'exact', head: true }).eq('shop_id', shopId).eq('profile_status', 'error'),
    ]);

    const { data: latest } = await supabase
      .from('customer_lifetime_profiles')
      .select('calculated_at')
      .eq('shop_id', shopId)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      healthy: true,
      totalProfiles: total.count ?? 0,
      readyProfiles: ready.count ?? 0,
      limitedProfiles: limited.count ?? 0,
      staleProfiles: stale.count ?? 0,
      errorProfiles: error.count ?? 0,
      lastCalculatedAt: latest?.calculated_at ?? null,
    };
  } catch (e) {
    return {
      healthy: false,
      totalProfiles: 0,
      readyProfiles: 0,
      limitedProfiles: 0,
      staleProfiles: 0,
      errorProfiles: 0,
      lastCalculatedAt: null,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPaymentReliability(ctx: CustomerLifetimeContext, calculatedAt: string): CustomerPaymentReliability {
  const invoices = ctx.invoiceHistory;
  const paidCount = invoices.filter(i => i.paidAt).length;
  const unpaidCount = invoices.filter(i => !i.paidAt && i.status !== 'void' && i.status !== 'cancelled').length;
  const unpaidBalance = ctx.invoiceHistory
    .filter(i => !i.paidAt && i.status !== 'void' && i.status !== 'cancelled')
    .reduce((s, i) => s + (i.totalAmount ?? 0), 0);

  if (invoices.length < 2) {
    return { score: null, paidPercentage: null, unpaidCount, unpaidBalance, dataQuality: 'insufficient_data', disclaimer: 'Fewer than 2 invoices — score not calculated.', calculatedAt };
  }

  const paidPct = paidCount / invoices.length;
  const score = Math.round(paidPct * 100);
  return {
    score,
    paidPercentage: Math.round(paidPct * 100),
    unpaidCount,
    unpaidBalance,
    dataQuality: invoices.length >= 5 ? 'medium' : 'low',
    disclaimer: 'Payment reliability is an internal operational metric for shop management only. Not a creditworthiness score.',
    calculatedAt,
  };
}

function assessDataQuality(ctx: CustomerLifetimeContext): CustomerDataQuality {
  const sampleSize = ctx.jobHistory.length + ctx.invoiceHistory.length + ctx.estimateHistory.length;
  const warnings: string[] = [...ctx.dataQualityWarnings];

  const hasVisitHistory = ctx.jobHistory.length > 0;
  const hasInvoiceHistory = ctx.invoiceHistory.length > 0;
  const hasEstimateHistory = ctx.estimateHistory.length > 0;
  const hasVehicles = ctx.vehicles.length > 0;

  if (!hasVehicles) warnings.push('no_vehicles_on_file');

  const confidenceLevel = sampleSize >= 15 ? 'high'
    : sampleSize >= 6 ? 'medium'
    : sampleSize >= 2 ? 'low'
    : 'insufficient';

  return { hasVisitHistory, hasInvoiceHistory, hasEstimateHistory, hasVehicles, sampleSize, confidenceLevel, warnings };
}

function buildSignals(
  ctx: CustomerLifetimeContext,
  profile: CustomerLifetimeProfile,
  shopId: string,
  customerId: string,
  builtAt: string
): CustomerIntelligenceSignal[] {
  const signals: CustomerIntelligenceSignal[] = [];

  if (profile.unpaidBalance > 0) {
    signals.push({
      id: 'sig_unpaid_balance',
      shopId, customerId,
      signalKey: 'unpaid_balance',
      signalType: 'financial',
      severity: profile.unpaidBalance > 500 ? 'critical' : 'warning',
      title: 'Outstanding balance',
      description: `Customer has an open balance of $${Math.round(profile.unpaidBalance)}.`,
      confidence: 0.95,
      estimatedRevenue: profile.unpaidBalance,
      sourceEntityType: 'invoice',
      sourceEntityId: null,
      evidence: [{ source: 'invoices', sourceType: 'balance', description: 'Unpaid invoices', value: Math.round(profile.unpaidBalance), confidence: 0.95 }],
      metadata: {},
      isActive: true,
      createdAt: builtAt,
      updatedAt: builtAt,
    });
  }

  if (profile.churnRisk === 'critical' || profile.churnRisk === 'high') {
    signals.push({
      id: 'sig_churn_risk',
      shopId, customerId,
      signalKey: 'churn_risk',
      signalType: 'retention',
      severity: profile.churnRisk === 'critical' ? 'critical' : 'warning',
      title: `${profile.churnRisk === 'critical' ? 'Critical' : 'High'} retention risk`,
      description: 'Customer shows signs of churn based on service visit patterns.',
      confidence: 0.7,
      estimatedRevenue: null,
      sourceEntityType: null,
      sourceEntityId: null,
      evidence: [],
      metadata: {},
      isActive: true,
      createdAt: builtAt,
      updatedAt: builtAt,
    });
  }

  if (profile.unresolvedDeclinedWork.length >= 2) {
    const totalValue = profile.unresolvedDeclinedWork.reduce((s, d) => s + (d.estimatedValue ?? 0), 0);
    signals.push({
      id: 'sig_declined_work',
      shopId, customerId,
      signalKey: 'unresolved_declined_work',
      signalType: 'opportunity',
      severity: 'info',
      title: `${profile.unresolvedDeclinedWork.length} unresolved declined items`,
      description: 'Customer has previously declined work that may now be needed.',
      confidence: 0.85,
      estimatedRevenue: totalValue > 0 ? totalValue : null,
      sourceEntityType: 'estimate_declined_item',
      sourceEntityId: null,
      evidence: [],
      metadata: {},
      isActive: true,
      createdAt: builtAt,
      updatedAt: builtAt,
    });
  }

  return signals;
}

// ── Row Mappers ───────────────────────────────────────────────────────────────

function mapProfileRow(row: Record<string, unknown>): CustomerLifetimeProfile {
  return {
    id: String(row.id),
    shopId: String(row.shop_id),
    customerId: String(row.customer_id),
    profileStatus: String(row.profile_status ?? 'limited') as CustomerLifetimeProfile['profileStatus'],
    customerSince: row.customer_since ? String(row.customer_since) : null,
    lastVisitAt: row.last_visit_at ? String(row.last_visit_at) : null,
    firstVisitAt: row.first_visit_at ? String(row.first_visit_at) : null,
    visitCount: Number(row.visit_count ?? 0),
    activeVehicleCount: Number(row.active_vehicle_count ?? 0),
    completedJobCount: Number(row.completed_job_count ?? 0),
    estimateCount: Number(row.estimate_count ?? 0),
    approvedEstimateCount: Number(row.approved_estimate_count ?? 0),
    declinedEstimateCount: Number(row.declined_estimate_count ?? 0),
    invoiceCount: Number(row.invoice_count ?? 0),
    paidInvoiceCount: Number(row.paid_invoice_count ?? 0),
    unpaidInvoiceCount: Number(row.unpaid_invoice_count ?? 0),
    unpaidBalance: Number(row.unpaid_balance ?? 0),
    lifetimeRevenue: Number(row.lifetime_revenue ?? 0),
    averageInvoiceValue: Number(row.average_invoice_value ?? 0),
    averageDaysBetweenVisits: row.average_days_between_visits != null ? Number(row.average_days_between_visits) : null,
    approvalRate: row.approval_rate != null ? Number(row.approval_rate) : null,
    declineRate: row.decline_rate != null ? Number(row.decline_rate) : null,
    paymentReliabilityScore: row.payment_reliability_score != null ? Number(row.payment_reliability_score) : null,
    retentionScore: row.retention_score != null ? Number(row.retention_score) : null,
    relationshipScore: row.relationship_score != null ? Number(row.relationship_score) : null,
    customerSegment: row.customer_segment ? String(row.customer_segment) as CustomerLifetimeProfile['customerSegment'] : null,
    churnRisk: row.churn_risk ? String(row.churn_risk) as CustomerLifetimeProfile['churnRisk'] : null,
    predictedNextVisitStart: row.predicted_next_visit_start ? String(row.predicted_next_visit_start) : null,
    predictedNextVisitEnd: row.predicted_next_visit_end ? String(row.predicted_next_visit_end) : null,
    nextBestOpportunities: (row.next_best_opportunities as CustomerLifetimeProfile['nextBestOpportunities']) ?? [],
    unresolvedDeclinedWork: (row.unresolved_declined_work as CustomerLifetimeProfile['unresolvedDeclinedWork']) ?? [],
    activeRisks: (row.active_risks as CustomerLifetimeProfile['activeRisks']) ?? [],
    importantMemories: (row.important_memories as string[]) ?? [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    calculatedAt: String(row.calculated_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapSegmentRow(row: Record<string, unknown>): CustomerSegment {
  return {
    id: String(row.id),
    shopId: String(row.shop_id),
    customerId: String(row.customer_id),
    segmentKey: String(row.segment_key) as CustomerSegment['segmentKey'],
    segmentLabel: String(row.segment_label),
    segmentReason: row.segment_reason ? String(row.segment_reason) : null,
    confidence: Number(row.confidence ?? 0),
    evidence: (row.evidence as CustomerSegment['evidence']) ?? [],
    isPrimary: Boolean(row.is_primary),
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
