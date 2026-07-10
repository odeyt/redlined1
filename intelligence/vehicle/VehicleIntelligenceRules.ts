// SI-10: Vehicle Intelligence Rules
// Deterministic signal generation. No AI. No external calls.
// All outputs reference known data — no invented diagnoses.

import type {
  VehicleDtcPattern,
  VehicleDeclinedWork,
  VehicleIntelligenceContext,
  VehiclePartPattern,
  VehicleRecommendedCheck,
  VehicleRepairLesson,
  VehicleRepairPattern,
  VehicleRiskSignal,
} from './types';

// ── Rule 1: Repeat Concern ────────────────────────────────────

export function ruleRepeatConcern(concerns: VehicleRepairPattern[]): VehicleRiskSignal[] {
  return concerns
    .filter(c => c.count >= 2)
    .map(c => ({
      key:        `repeat_concern_${c.category.toLowerCase().replace(/\s+/g, '_')}`,
      severity:   c.count >= 4 ? 'high' as const : 'medium' as const,
      title:      `Repeat concern: ${c.category}`,
      description: `This vehicle has been brought in for ${c.category} concerns ${c.count} times.`,
      confidence: 0.9,
      sourceType: 'repair_case',
      sourceId:   null,
    }));
}

// ── Rule 2: Repeat DTC ────────────────────────────────────────

export function ruleRepeatDtc(dtcs: VehicleDtcPattern[]): VehicleRiskSignal[] {
  return dtcs
    .filter(d => d.count >= 2)
    .map(d => ({
      key:        `repeat_dtc_${d.code.toLowerCase()}`,
      severity:   d.resolved ? 'info' as const : 'high' as const,
      title:      `Recurring DTC: ${d.code}`,
      description: `DTC ${d.code} has been recorded ${d.count} times${d.resolved ? ' (last occurrence resolved)' : ' — currently unresolved'}.`,
      confidence: 0.85,
      sourceType: 'repair_case',
      sourceId:   null,
    }));
}

// ── Rule 3: Unresolved Declined Work ─────────────────────────

export function ruleUnresolvedDeclinedWork(declined: VehicleDeclinedWork[]): VehicleRiskSignal[] {
  return declined.map(d => {
    const isSafety = /brake|tyre|tire|steering|airbag|seatbelt|suspension|safety/i.test(d.category + ' ' + d.title);
    return {
      key:        `declined_work_${d.estimateId}`,
      severity:   isSafety ? 'high' as const : 'medium' as const,
      title:      `Previously declined: ${d.title}`,
      description: `Work declined ${d.daysSinceDecline} days ago may still require review.`,
      confidence: 0.8,
      sourceType: 'estimate',
      sourceId:   d.estimateId,
    };
  });
}

// ── Rule 4: Comeback Pattern ──────────────────────────────────

export function ruleComebackPattern(
  comebackCount: number,
  concerns: VehicleRepairPattern[],
): VehicleRiskSignal[] {
  if (comebackCount === 0) return [];
  const repeatedAfterRepair = concerns.filter(c => c.count >= 2);
  const signals: VehicleRiskSignal[] = [{
    key:        'comeback_pattern',
    severity:   comebackCount >= 2 ? 'high' as const : 'medium' as const,
    title:      `${comebackCount} comeback${comebackCount === 1 ? '' : 's'} recorded`,
    description: 'Vehicle has returned after a completed repair. Review repair outcomes for this vehicle.',
    confidence: 0.85,
    sourceType: 'repair_order',
    sourceId:   null,
  }];
  if (repeatedAfterRepair.length > 0) {
    signals.push({
      key:        'possible_comeback_pattern',
      severity:   'medium',
      title:      'Possible comeback pattern — same concern recurring',
      description: `${repeatedAfterRepair.map(c => c.category).join(', ')} concerns have repeated. May indicate incomplete resolution.`,
      confidence: 0.7,
      sourceType: 'repair_case',
      sourceId:   null,
    });
  }
  return signals;
}

// ── Rule 5: Missing Repair Intelligence ──────────────────────

export function ruleMissingRepairIntelligence(
  completedJobCount: number,
  repairCaseCount: number,
): VehicleRiskSignal | null {
  if (completedJobCount === 0) return null;
  const missingRatio = repairCaseCount / completedJobCount;
  if (missingRatio >= 0.8) return null; // well-documented

  return {
    key:        'missing_repair_intelligence',
    severity:   missingRatio < 0.2 ? 'medium' as const : 'info' as const,
    title:      'Repair history is incomplete',
    description: `${completedJobCount} completed job${completedJobCount === 1 ? '' : 's'} recorded but only ${repairCaseCount} repair case${repairCaseCount === 1 ? '' : 's'} linked. Add repair cases to improve intelligence.`,
    confidence: 1.0,
    sourceType: 'job_card',
    sourceId:   null,
  };
}

// ── Rule 6: Overdue Maintenance Candidate ────────────────────

export function ruleMaintenanceCandidate(
  latestMileage: number | null,
  lastVisitAt: string | null,
): VehicleRiskSignal | null {
  // Only use known data — no invented OEM intervals
  if (!lastVisitAt) return null;
  const daysSince = Math.floor((Date.now() - new Date(lastVisitAt).getTime()) / 86_400_000);
  if (daysSince < 180) return null; // visited within 6 months, not overdue

  const mileageNote = latestMileage ? ` Last recorded mileage: ${latestMileage.toLocaleString()}.` : '';
  return {
    key:        'maintenance_candidate',
    severity:   daysSince > 365 ? 'medium' as const : 'info' as const,
    title:      'Maintenance review recommended',
    description: `Vehicle has not been serviced in ${daysSince} days based on shop records.${mileageNote} A maintenance check may be appropriate.`,
    confidence: 0.75,
    sourceType: 'job_card',
    sourceId:   null,
  };
}

// ── Rule 7: High-Value Vehicle ────────────────────────────────

export function ruleHighValueVehicle(
  totalRevenue: number,
  threshold = 5000,
): VehicleRiskSignal | null {
  if (totalRevenue < threshold) return null;
  return {
    key:        'high_value_vehicle',
    severity:   'info',
    title:      `High-value vehicle relationship — $${totalRevenue.toFixed(0)} recorded`,
    description: 'This vehicle has generated significant revenue for the shop. Prioritize service quality.',
    confidence: 1.0,
    sourceType: 'invoice',
    sourceId:   null,
  };
}

// ── Rule 8: Low Data Confidence ──────────────────────────────

export function ruleLowDataConfidence(context: VehicleIntelligenceContext): VehicleRiskSignal | null {
  if (context.visitCount >= 3 && context.completedJobCount >= 2) return null;
  return {
    key:        'low_data_confidence',
    severity:   'info',
    title:      'Limited vehicle history',
    description: 'More completed repair data is required to build a full intelligence profile for this vehicle.',
    confidence: 1.0,
    sourceType: null,
    sourceId:   null,
  };
}

// ── Rule 9: Parts Pattern ─────────────────────────────────────

export function rulePartsPattern(parts: VehiclePartPattern[]): VehicleRiskSignal[] {
  return parts
    .filter(p => p.count >= 2)
    .map(p => ({
      key:        `parts_pattern_${p.partName.toLowerCase().replace(/\s+/g, '_').slice(0, 30)}`,
      severity:   'info' as const,
      title:      `Repeated part: ${p.partName} (${p.count}x)`,
      description: `${p.partName} has been used on this vehicle ${p.count} times. Review if relevant to current concern.`,
      confidence: 0.8,
      sourceType: 'parts_order',
      sourceId:   null,
    }));
}

// ── Rule 10: Technician Familiarity ──────────────────────────

export function ruleTechnicianFamiliarity(
  lessons: VehicleRepairLesson[],
): VehicleRiskSignal | null {
  if (lessons.length === 0) return null;

  const techMap: Record<string, number> = {};
  for (const l of lessons) {
    if (!l.technicianId || !l.verifiedSuccessful) continue;
    techMap[l.technicianId] = (techMap[l.technicianId] ?? 0) + 1;
  }

  const [topTechId, topCount] = Object.entries(techMap).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!topTechId || topCount < 2) return null;

  return {
    key:        `tech_familiarity_${topTechId}`,
    severity:   'info',
    title:      `Technician has ${topCount} verified successful repairs on this vehicle`,
    description: 'This technician has the most experience with this vehicle\'s repair history.',
    confidence: 0.85,
    sourceType: 'repair_case',
    sourceId:   topTechId,
  };
}

// ── Recommended checks generator ──────────────────────────────

export function generateDeterministicChecks(
  context: VehicleIntelligenceContext,
): VehicleRecommendedCheck[] {
  const checks: VehicleRecommendedCheck[] = [];

  // Check from declined work
  for (const d of context.declinedWork) {
    checks.push({
      key:       `check_declined_${d.estimateId}`,
      title:     `Review previously declined: ${d.title}`,
      rationale: `Customer declined this work ${d.daysSinceDecline} days ago. Condition may have changed.`,
      confidence: 0.75,
      priority:   /brake|tyre|tire|steering|safety/i.test(d.title) ? 'high' : 'medium',
      basedOn:    'Declined estimate record',
    });
  }

  // Check from repeat concerns
  for (const c of context.concerns.filter(x => x.count >= 2)) {
    checks.push({
      key:       `check_concern_${c.category.replace(/\s+/g, '_')}`,
      title:     `Inspect ${c.category} — recurring concern`,
      rationale: `${c.category} has been a repeated concern (${c.count}x). Inspect for underlying cause.`,
      confidence: 0.8,
      priority:  c.count >= 3 ? 'high' : 'medium',
      basedOn:   'Repair case history',
    });
  }

  // Check from repeat DTCs
  for (const d of context.dtcs.filter(x => x.count >= 2 && !x.resolved)) {
    checks.push({
      key:       `check_dtc_${d.code}`,
      title:     `Verify DTC ${d.code} — recurring unresolved`,
      rationale: `DTC ${d.code} has appeared ${d.count} times without confirmed resolution.`,
      confidence: 0.85,
      priority:  'high',
      basedOn:   'DTC scan history',
    });
  }

  // Check maintenance if overdue
  if (context.latestMileage && context.visitCount > 0) {
    const lastVisit = context.repairLessons.length > 0
      ? context.repairLessons.sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0].completedAt
      : null;
    if (lastVisit) {
      const daysSince = Math.floor((Date.now() - new Date(lastVisit).getTime()) / 86_400_000);
      if (daysSince > 180) {
        checks.push({
          key:       'check_maintenance_review',
          title:     'Maintenance review — not serviced recently',
          rationale: `Vehicle last serviced ${daysSince} days ago per shop records. Recommend review.`,
          confidence: 0.7,
          priority:  daysSince > 365 ? 'medium' : 'low',
          basedOn:   'Service history dates',
        });
      }
    }
  }

  // Deduplicate by key, limit to 6
  const seen = new Set<string>();
  return checks.filter(c => { if (seen.has(c.key)) return false; seen.add(c.key); return true; }).slice(0, 6);
}
