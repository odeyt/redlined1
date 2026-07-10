// SI-13: Sapelee Customer Intelligence Payload
// Future contract only. No Sapelee calls are made in this epic.
// PII exclusions: no name, phone, email, address, VIN, or payment data.

import type { CustomerLifetimeProfile, CustomerSegment, CustomerRetentionRiskResult } from './types';

export interface SapeleeCustomerPayload {
  schemaVersion: '1.0';
  shopId: string;
  customerId: string;
  profileStatus: string;
  visitCount: number;
  lifetimeRevenue: number;
  averageInvoiceValue: number;
  approvalRate: number | null;
  declineRate: number | null;
  paymentReliabilityScore: number | null;
  retentionScore: number | null;
  relationshipScore: number | null;
  customerSegment: string | null;
  churnRisk: string | null;
  activeVehicleCount: number;
  unresolvedDeclinedWorkCount: number;
  activeRisksCount: number;
  retentionRisk: string;
  topSegments: string[];
  dataQuality: string;
}

export function buildSapeleePayload(
  profile: CustomerLifetimeProfile,
  segments: CustomerSegment[],
  retentionRisk: CustomerRetentionRiskResult
): SapeleeCustomerPayload {
  const topSegments = segments
    .filter(s => s.isActive && s.segmentKey !== 'price_sensitive')
    .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
    .slice(0, 5)
    .map(s => s.segmentKey);

  return {
    schemaVersion: '1.0',
    shopId: profile.shopId,
    customerId: profile.customerId,
    profileStatus: profile.profileStatus,
    visitCount: profile.visitCount,
    lifetimeRevenue: profile.lifetimeRevenue,
    averageInvoiceValue: profile.averageInvoiceValue,
    approvalRate: profile.approvalRate,
    declineRate: profile.declineRate,
    paymentReliabilityScore: profile.paymentReliabilityScore,
    retentionScore: profile.retentionScore,
    relationshipScore: profile.relationshipScore,
    customerSegment: profile.customerSegment,
    churnRisk: profile.churnRisk,
    activeVehicleCount: profile.activeVehicleCount,
    unresolvedDeclinedWorkCount: profile.unresolvedDeclinedWork.length,
    activeRisksCount: profile.activeRisks.length,
    retentionRisk: retentionRisk.risk,
    topSegments,
    dataQuality: retentionRisk.dataQuality,
  };
}
