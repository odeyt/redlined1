// SI-13: Customer → Service Advisor Adapter
// Surfaces relevant customer intelligence into service advisor sessions.

import type { CustomerLifetimeProfile, CustomerRevenueOpportunity, DeclinedWorkRecord } from './types';

export interface CustomerAdvisorContext {
  customerId: string;
  lifetimeRevenue: number;
  visitCount: number;
  lastVisitAt: string | null;
  unresolvedDeclinedWork: DeclinedWorkRecord[];
  topOpportunities: CustomerRevenueOpportunity[];
  retentionRisk: string | null;
  relationshipScore: number | null;
  segment: string | null;
  dataQuality: string;
}

export function buildCustomerAdvisorContext(profile: CustomerLifetimeProfile): CustomerAdvisorContext {
  return {
    customerId: profile.customerId,
    lifetimeRevenue: profile.lifetimeRevenue,
    visitCount: profile.visitCount,
    lastVisitAt: profile.lastVisitAt,
    unresolvedDeclinedWork: profile.unresolvedDeclinedWork,
    topOpportunities: profile.nextBestOpportunities.slice(0, 3),
    retentionRisk: profile.churnRisk,
    relationshipScore: profile.relationshipScore,
    segment: profile.customerSegment,
    dataQuality: profile.profileStatus === 'ready' ? 'high' : profile.profileStatus === 'building' ? 'medium' : 'low',
  };
}
