// SI-13: Customer Segmentation Engine
// NOTE: 'price_sensitive' segment is never shown to customers or in customer-facing output.

import type { CustomerLifetimeContext, CustomerSegment, CustomerSegmentKey, CustomerEvidence } from './types';

interface SegmentCandidate {
  key: CustomerSegmentKey;
  label: string;
  reason: string;
  confidence: number;
  evidence: CustomerEvidence[];
  isPrimary: boolean;
}

export function classifyCustomerSegments(
  ctx: CustomerLifetimeContext,
  shopId: string,
  customerId: string
): SegmentCandidate[] {
  const now = new Date();
  const candidates: SegmentCandidate[] = [];

  const visitCount = ctx.jobHistory.length;
  const invoiceCount = ctx.invoiceHistory.length;
  const lifetimeRevenue = ctx.invoiceHistory
    .filter(i => i.paidAt)
    .reduce((sum, i) => sum + (i.totalAmount ?? 0), 0);
  const approvedEstimates = ctx.estimateHistory.filter(e => e.approvedAt).length;
  const declinedEstimates = ctx.estimateHistory.filter(e => e.declinedAt).length;
  const totalEstimates = ctx.estimateHistory.length;
  const approvalRate = totalEstimates >= 2 ? approvedEstimates / totalEstimates : null;
  const declineRate = totalEstimates >= 2 ? declinedEstimates / totalEstimates : null;
  const activeVehicles = ctx.vehicles.filter(v => v.isActive).length;
  const lastJob = ctx.jobHistory[0];
  const daysSinceLastJob = lastJob
    ? Math.floor((now.getTime() - new Date(lastJob.createdAt).getTime()) / 86400000)
    : null;
  const customerSince = ctx.customer?.createdAt ? new Date(ctx.customer.createdAt) : null;
  const customerAgeDays = customerSince
    ? Math.floor((now.getTime() - customerSince.getTime()) / 86400000)
    : null;

  // ── VIP: long history + high revenue + loyal ──────────────────────────────
  if (visitCount >= 10 && lifetimeRevenue >= 5000) {
    candidates.push({
      key: 'vip',
      label: 'VIP',
      reason: `Long-term customer with ${visitCount} visits and significant service history.`,
      confidence: 0.9,
      evidence: [
        { source: 'job_cards', sourceType: 'count', description: `${visitCount} service visits`, value: visitCount, confidence: 0.95 },
        { source: 'invoices', sourceType: 'revenue', description: `Lifetime revenue ≥ $5,000`, value: Math.round(lifetimeRevenue), confidence: 0.85 },
      ],
      isPrimary: true,
    });
  }

  // ── High Value ─────────────────────────────────────────────────────────────
  if (lifetimeRevenue >= 2000 && visitCount >= 3 && !candidates.some(c => c.key === 'vip')) {
    candidates.push({
      key: 'high_value',
      label: 'High Value',
      reason: `Customer has generated significant revenue across ${visitCount} visits.`,
      confidence: 0.85,
      evidence: [
        { source: 'invoices', sourceType: 'revenue', description: `Lifetime revenue ≥ $2,000`, value: Math.round(lifetimeRevenue), confidence: 0.9 },
      ],
      isPrimary: true,
    });
  }

  // ── Fleet ──────────────────────────────────────────────────────────────────
  if (ctx.customer?.isFleet) {
    candidates.push({
      key: 'fleet',
      label: 'Fleet',
      reason: 'Account is flagged as a fleet customer.',
      confidence: 1.0,
      evidence: [{ source: 'customers', sourceType: 'flag', description: 'Fleet flag set', confidence: 1.0 }],
      isPrimary: false,
    });
  }

  // ── Commercial ────────────────────────────────────────────────────────────
  if (ctx.customer?.isCommercial) {
    candidates.push({
      key: 'commercial',
      label: 'Commercial',
      reason: 'Account is flagged as a commercial customer.',
      confidence: 1.0,
      evidence: [{ source: 'customers', sourceType: 'flag', description: 'Commercial flag set', confidence: 1.0 }],
      isPrimary: false,
    });
  }

  // ── Loyal ──────────────────────────────────────────────────────────────────
  if (visitCount >= 5 && daysSinceLastJob !== null && daysSinceLastJob <= 365) {
    if (!candidates.some(c => c.key === 'vip' || c.key === 'high_value')) {
      candidates.push({
        key: 'loyal',
        label: 'Loyal',
        reason: `${visitCount} visits, most recently within the past year.`,
        confidence: 0.85,
        evidence: [
          { source: 'job_cards', sourceType: 'count', description: `${visitCount} total visits`, value: visitCount, confidence: 0.95 },
        ],
        isPrimary: true,
      });
    }
  }

  // ── New Customer ───────────────────────────────────────────────────────────
  if (visitCount <= 2 && customerAgeDays !== null && customerAgeDays <= 120) {
    candidates.push({
      key: 'new_customer',
      label: 'New Customer',
      reason: 'Account created within the last 4 months with limited visit history.',
      confidence: 0.9,
      evidence: [
        { source: 'customers', sourceType: 'age', description: 'Account less than 120 days old', confidence: 0.9 },
      ],
      isPrimary: candidates.length === 0,
    });
  }

  // ── Frequent ──────────────────────────────────────────────────────────────
  if (visitCount >= 4 && !candidates.some(c => ['vip', 'high_value', 'loyal'].includes(c.key))) {
    candidates.push({
      key: 'frequent',
      label: 'Frequent',
      reason: `${visitCount} service visits recorded.`,
      confidence: 0.8,
      evidence: [{ source: 'job_cards', sourceType: 'count', description: `${visitCount} visits`, value: visitCount, confidence: 0.9 }],
      isPrimary: candidates.length === 0,
    });
  }

  // ── At Risk ────────────────────────────────────────────────────────────────
  if (visitCount >= 3 && daysSinceLastJob !== null && daysSinceLastJob > 270 && daysSinceLastJob <= 540) {
    candidates.push({
      key: 'at_risk',
      label: 'At Risk',
      reason: `No visit in ${daysSinceLastJob} days despite prior service history.`,
      confidence: 0.75,
      evidence: [
        { source: 'job_cards', sourceType: 'recency', description: `Last visit ${daysSinceLastJob} days ago`, value: daysSinceLastJob, confidence: 0.9 },
      ],
      isPrimary: false,
    });
  }

  // ── Lost ──────────────────────────────────────────────────────────────────
  if (visitCount >= 2 && daysSinceLastJob !== null && daysSinceLastJob > 540) {
    candidates.push({
      key: 'lost',
      label: 'Lost',
      reason: `No visit in over 18 months (${daysSinceLastJob} days).`,
      confidence: 0.7,
      evidence: [
        { source: 'job_cards', sourceType: 'recency', description: `Last visit ${daysSinceLastJob} days ago`, value: daysSinceLastJob, confidence: 0.85 },
      ],
      isPrimary: false,
    });
  }

  // ── Occasional ────────────────────────────────────────────────────────────
  if (visitCount >= 2 && visitCount <= 3 && daysSinceLastJob !== null && daysSinceLastJob > 120 && daysSinceLastJob <= 540) {
    if (!candidates.some(c => ['at_risk', 'lost', 'loyal', 'vip', 'high_value', 'frequent'].includes(c.key))) {
      candidates.push({
        key: 'occasional',
        label: 'Occasional',
        reason: 'Infrequent visitor with some service history.',
        confidence: 0.7,
        evidence: [
          { source: 'job_cards', sourceType: 'frequency', description: `${visitCount} visits, last ${daysSinceLastJob} days ago`, confidence: 0.75 },
        ],
        isPrimary: candidates.length === 0,
      });
    }
  }

  // ── Price Sensitive (internal only — never customer-facing) ───────────────
  if (
    totalEstimates >= 4 &&
    declineRate !== null &&
    approvalRate !== null &&
    declineRate >= 0.6 &&
    approvalRate <= 0.35
  ) {
    candidates.push({
      key: 'price_sensitive',
      label: 'Price Sensitive',
      reason: 'Low estimate approval rate relative to total estimates.',
      confidence: 0.65,
      evidence: [
        { source: 'estimates', sourceType: 'rate', description: `${Math.round((declineRate ?? 0) * 100)}% decline rate`, value: Math.round((declineRate ?? 0) * 100), confidence: 0.75 },
      ],
      isPrimary: false,
    });
  }

  // ── Unresolved Declined Work ───────────────────────────────────────────────
  if (ctx.declinedWork.length >= 2) {
    candidates.push({
      key: 'unresolved_declined_work',
      label: 'Unresolved Declined Work',
      reason: `${ctx.declinedWork.length} declined service items on record.`,
      confidence: 0.85,
      evidence: [
        { source: 'estimate_declined_items', sourceType: 'count', description: `${ctx.declinedWork.length} declined items`, value: ctx.declinedWork.length, confidence: 0.9 },
      ],
      isPrimary: false,
    });
  }

  // ── Outstanding Balance ────────────────────────────────────────────────────
  const unpaidBalance = ctx.invoiceHistory
    .filter(i => !i.paidAt && i.status !== 'void' && i.status !== 'cancelled')
    .reduce((sum, i) => sum + (i.totalAmount ?? 0), 0);
  if (unpaidBalance > 0) {
    candidates.push({
      key: 'outstanding_balance',
      label: 'Outstanding Balance',
      reason: `Open balance on unpaid invoices.`,
      confidence: 0.9,
      evidence: [
        { source: 'invoices', sourceType: 'balance', description: 'Unpaid invoices on file', value: Math.round(unpaidBalance), confidence: 0.9 },
      ],
      isPrimary: false,
    });
  }

  // ── Maintenance Opportunity ───────────────────────────────────────────────
  if (activeVehicles >= 1 && daysSinceLastJob !== null && daysSinceLastJob >= 90 && daysSinceLastJob <= 270 && visitCount >= 1) {
    candidates.push({
      key: 'maintenance_opportunity',
      label: 'Maintenance Due',
      reason: `Vehicle(s) may be approaching routine maintenance interval.`,
      confidence: 0.5,
      evidence: [
        { source: 'job_cards', sourceType: 'recency', description: `Last visit ${daysSinceLastJob} days ago`, value: daysSinceLastJob, confidence: 0.7 },
      ],
      isPrimary: false,
    });
  }

  // ── Limited Data ──────────────────────────────────────────────────────────
  if (candidates.length === 0 || (visitCount === 0 && invoiceCount === 0)) {
    candidates.push({
      key: 'limited_data',
      label: 'Limited Data',
      reason: 'Insufficient service history for classification.',
      confidence: 1.0,
      evidence: [],
      isPrimary: true,
    });
  }

  // Ensure only one primary
  const hasPrimary = candidates.some(c => c.isPrimary);
  if (!hasPrimary && candidates.length > 0) {
    candidates[0].isPrimary = true;
  }

  return candidates;
}

export function toCustomerSegments(
  candidates: SegmentCandidate[],
  shopId: string,
  customerId: string
): Omit<CustomerSegment, 'id' | 'createdAt' | 'updatedAt'>[] {
  return candidates.map(c => ({
    shopId,
    customerId,
    segmentKey: c.key,
    segmentLabel: c.label,
    segmentReason: c.reason,
    confidence: c.confidence,
    evidence: c.evidence,
    isPrimary: c.isPrimary,
    isActive: true,
  }));
}

export function getPrimarySegment(candidates: SegmentCandidate[]): CustomerSegmentKey | null {
  const primary = candidates.find(c => c.isPrimary);
  return primary?.key ?? null;
}
