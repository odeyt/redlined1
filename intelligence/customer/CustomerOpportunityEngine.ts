// SI-13: Customer Revenue Opportunity Engine
// All suggestions require technician verification. No automatic actions.

const DISCLAIMER = 'Requires technician inspection and advisor review before any action is taken.';

import type { CustomerLifetimeContext, CustomerRevenueOpportunity, CustomerEvidence } from './types';

export function findCustomerOpportunities(ctx: CustomerLifetimeContext): CustomerRevenueOpportunity[] {
  const now = new Date();
  const opportunities: CustomerRevenueOpportunity[] = [];

  const lastJob = ctx.jobHistory[0];
  const daysSinceLastJob = lastJob
    ? Math.floor((now.getTime() - new Date(lastJob.createdAt).getTime()) / 86400000)
    : null;

  // ── Declined work re-engagement ───────────────────────────────────────────
  if (ctx.declinedWork.length > 0) {
    const totalDeclinedValue = ctx.declinedWork.reduce((sum, d) => sum + (d.estimatedValue ?? 0), 0);
    const evidence: CustomerEvidence[] = ctx.declinedWork.slice(0, 3).map(d => ({
      source: 'estimate_declined_items',
      sourceType: 'declined_work',
      entityId: d.id,
      entityType: 'estimate_declined_item',
      description: d.description,
      value: d.estimatedValue ?? undefined,
      date: d.declinedAt ?? undefined,
      confidence: 0.9,
    }));

    opportunities.push({
      opportunityType: 'declined_work_re_engagement',
      title: `${ctx.declinedWork.length} previously declined service item${ctx.declinedWork.length !== 1 ? 's' : ''}`,
      reason: 'Customer previously declined work that may now be needed or overdue.',
      evidence,
      expectedRevenue: totalDeclinedValue > 0 ? totalDeclinedValue : null,
      confidence: 0.7,
      recommendedAction: 'Review declined items with technician and discuss with customer at next visit.',
      disclaimer: DISCLAIMER,
      dataQuality: 'medium',
    });
  }

  // ── Maintenance interval ───────────────────────────────────────────────────
  if (daysSinceLastJob !== null && daysSinceLastJob >= 90 && ctx.vehicles.filter(v => v.isActive).length > 0) {
    opportunities.push({
      opportunityType: 'maintenance_interval',
      title: 'Routine maintenance may be due',
      reason: `Last service visit was ${daysSinceLastJob} days ago.`,
      evidence: [
        {
          source: 'job_cards',
          sourceType: 'recency',
          description: `Last visit ${daysSinceLastJob} days ago`,
          value: daysSinceLastJob,
          confidence: 0.8,
        },
      ],
      expectedRevenue: null,
      confidence: daysSinceLastJob >= 180 ? 0.75 : 0.5,
      recommendedAction: 'Review vehicle service history to confirm what maintenance may be overdue.',
      disclaimer: DISCLAIMER,
      dataQuality: 'low',
    });
  }

  // ── Vehicle intelligence signals ───────────────────────────────────────────
  if (ctx.vehicleIntelligenceSummary && ctx.vehicleIntelligenceSummary.length > 0) {
    opportunities.push({
      opportunityType: 'vehicle_intelligence_signal',
      title: 'Active vehicle intelligence signals',
      reason: 'Vehicle monitoring has flagged items that may need attention.',
      evidence: [
        {
          source: 'vehicle_intelligence_signals',
          sourceType: 'signal',
          description: ctx.vehicleIntelligenceSummary.substring(0, 200),
          confidence: 0.7,
        },
      ],
      expectedRevenue: null,
      confidence: 0.65,
      recommendedAction: 'Review active vehicle intelligence signals with technician before customer contact.',
      disclaimer: DISCLAIMER,
      dataQuality: 'medium',
    });
  }

  // ── Multi-vehicle upsell (note: not an upsell command, just visibility) ────
  const activeVehicles = ctx.vehicles.filter(v => v.isActive);
  if (activeVehicles.length >= 2) {
    const vehiclesWithNoRecentJob = activeVehicles.filter(v => {
      const vehicleJobs = ctx.jobHistory.filter(j => {
        // We don't have vehicle_id on JobCardRow, so we can't be precise here.
        // Just flag that the customer has multiple vehicles for advisor awareness.
        return false;
      });
      return vehicleJobs.length === 0;
    });
    // Just note multi-vehicle presence for advisor awareness
    if (activeVehicles.length >= 2) {
      opportunities.push({
        opportunityType: 'multi_vehicle_awareness',
        title: `${activeVehicles.length} active vehicles on file`,
        reason: 'Customer has multiple vehicles — ensure all are up to date.',
        evidence: [
          { source: 'vehicles', sourceType: 'count', description: `${activeVehicles.length} active vehicles`, value: activeVehicles.length, confidence: 0.95 },
        ],
        expectedRevenue: null,
        confidence: 0.8,
        recommendedAction: 'Confirm service history for all vehicles is up to date.',
        disclaimer: DISCLAIMER,
        dataQuality: 'high',
      });
    }
  }

  // ── Fleet / commercial scheduling ─────────────────────────────────────────
  if ((ctx.customer?.isFleet || ctx.customer?.isCommercial) && daysSinceLastJob !== null && daysSinceLastJob > 60) {
    opportunities.push({
      opportunityType: 'fleet_scheduling',
      title: 'Fleet/commercial maintenance review',
      reason: 'Fleet accounts benefit from regular scheduled maintenance to minimize downtime.',
      evidence: [
        { source: 'customers', sourceType: 'flag', description: 'Fleet or commercial account', confidence: 1.0 },
      ],
      expectedRevenue: null,
      confidence: 0.7,
      recommendedAction: 'Schedule routine fleet review appointment.',
      disclaimer: DISCLAIMER,
      dataQuality: 'high',
    });
  }

  // Deduplicate and cap
  return opportunities.slice(0, 5);
}
