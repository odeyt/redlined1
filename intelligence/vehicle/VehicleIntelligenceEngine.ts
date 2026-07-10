// SI-10: Vehicle Intelligence Engine
// Deterministic profile builder. No AI. No external calls.
// Missing data returns warnings, not errors. Never blocks vehicle page.

import type {
  VehicleDtcPattern,
  VehicleDeclinedWork,
  VehicleHealthStatus,
  VehicleIntelligenceBuildResult,
  VehicleIntelligenceContext,
  VehicleIntelligenceProfile,
  VehicleIntelligenceSignal,
  VehicleIntelligenceStatus,
  VehiclePartPattern,
  VehicleRecommendedCheck,
  VehicleRepairLesson,
  VehicleRepairPattern,
  VehicleRiskSignal,
} from './types';
import {
  generateDeterministicChecks,
  ruleComebackPattern,
  ruleHighValueVehicle,
  ruleLowDataConfidence,
  ruleMaintenanceCandidate,
  ruleMissingRepairIntelligence,
  rulePartsPattern,
  ruleRepeatConcern,
  ruleRepeatDtc,
  ruleTechnicianFamiliarity,
  ruleUnresolvedDeclinedWork,
} from './VehicleIntelligenceRules';

// ── DB helper ─────────────────────────────────────────────────

async function getDb() {
  const { getAdminDb } = await import('@/lib/supabaseServer');
  return getAdminDb();
}

// ── Health Score ──────────────────────────────────────────────

export function calculateVehicleHealth(
  context: VehicleIntelligenceContext,
): { score: number; status: VehicleHealthStatus } {
  let score = 100;

  if (context.comebackCount > 0)          score -= 20;
  if (context.concerns.some(c => c.count >= 2)) score -= 15;
  if (context.dtcs.some(d => d.count >= 2 && !d.resolved)) score -= 10;
  // Unresolved declined safety work
  const safetyDeclined = context.declinedWork.filter(d =>
    /brake|tyre|tire|steering|airbag|safety/i.test(d.title + ' ' + d.category),
  );
  if (safetyDeclined.length > 0)          score -= 20;
  if (context.unpaidInvoiceCount > 0)     score -= 5;
  if (!context.hasCompleteHistory)        score -= 5;
  if (context.openEstimateCount > 1)      score -= 5;
  // Additional deduction per risk signal category
  if (context.comebackCount >= 2)         score -= 15;

  // Additions for verified good history
  const verifiedRepairs = context.repairLessons.filter(l => l.verifiedSuccessful);
  if (verifiedRepairs.length >= 3) score += Math.min(5, verifiedRepairs.length);
  if (context.comebackCount === 0 && context.completedJobCount >= 3) score += 5;

  score = Math.max(0, Math.min(100, Math.round(score)));

  const status: VehicleHealthStatus =
    score >= 80 ? 'healthy' :
    score >= 60 ? 'monitor' :
    score >= 40 ? 'attention' : 'high_risk';

  return { score, status };
}

// ── Data extractors ───────────────────────────────────────────

export async function extractVisitHistory(
  shopId: string,
  vehicleId: string,
): Promise<{ visitCount: number; lastVisitAt: string | null; latestMileage: number | null }> {
  try {
    const db = await getDb();
    const { data } = await db
      .from('job_cards')
      .select('created_at, status')
      .eq('shop_id', shopId)
      .eq('vehicle_id', vehicleId)
      .order('created_at', { ascending: false });
    const rows = (data ?? []) as Array<{ created_at: string; status: string }>;
    return {
      visitCount:   rows.length,
      lastVisitAt:  rows[0]?.created_at ?? null,
      latestMileage: null, // mileage stored as string in vehicles table — not extracted here
    };
  } catch { return { visitCount: 0, lastVisitAt: null, latestMileage: null }; }
}

export async function extractRepairHistory(
  shopId: string,
  vehicleId: string,
): Promise<{ completedCount: number; lastCompletedAt: string | null }> {
  try {
    const db = await getDb();
    const { data } = await db
      .from('job_cards')
      .select('completed_at, status')
      .eq('shop_id', shopId)
      .eq('vehicle_id', vehicleId)
      .eq('status', 'complete')
      .order('completed_at', { ascending: false });
    const rows = (data ?? []) as Array<{ completed_at: string }>;
    return { completedCount: rows.length, lastCompletedAt: rows[0]?.completed_at ?? null };
  } catch { return { completedCount: 0, lastCompletedAt: null }; }
}

export async function extractRepairCaseHistory(
  shopId: string,
  vehicleId: string,
): Promise<{ count: number; concerns: VehicleRepairPattern[]; lessons: VehicleRepairLesson[]; comebackCount: number }> {
  try {
    const db = await getDb();
    const { data } = await db
      .from('repair_cases')
      .select('id, concern_category, created_at, status, assigned_technician_id, resolution, is_warranty')
      .eq('shop_id', shopId)
      .eq('vehicle_id', vehicleId)
      .order('created_at', { ascending: false });

    if (!data) return { count: 0, concerns: [], lessons: [], comebackCount: 0 };
    const rows = data as Array<{
      id: string; concern_category?: string; created_at: string;
      status?: string; assigned_technician_id?: string | null;
      resolution?: string | null; is_warranty?: boolean;
    }>;

    // Concern patterns
    const catMap: Record<string, { count: number; lastSeen: string; techId: string | null }> = {};
    for (const r of rows) {
      const cat = r.concern_category ?? 'General';
      if (!catMap[cat]) catMap[cat] = { count: 0, lastSeen: r.created_at, techId: r.assigned_technician_id ?? null };
      catMap[cat].count++;
      if (r.created_at > catMap[cat].lastSeen) catMap[cat].lastSeen = r.created_at;
    }
    const concerns: VehicleRepairPattern[] = Object.entries(catMap)
      .map(([category, v]) => ({ category, count: v.count, lastSeen: v.lastSeen, technicianId: v.techId }))
      .sort((a, b) => b.count - a.count);

    // Lessons
    const lessons: VehicleRepairLesson[] = rows
      .filter(r => r.status === 'resolved')
      .map(r => ({
        repairCaseId:       r.id,
        concern:            r.concern_category ?? 'General',
        category:           r.concern_category ?? 'General',
        resolution:         r.resolution ?? null,
        technicianId:       r.assigned_technician_id ?? null,
        completedAt:        r.created_at,
        verifiedSuccessful: true,
      }));

    const comebackCount = rows.filter(r => r.is_warranty).length;

    return { count: rows.length, concerns, lessons, comebackCount };
  } catch { return { count: 0, concerns: [], lessons: [], comebackCount: 0 }; }
}

export async function extractEstimateHistory(
  shopId: string,
  vehicleId: string,
): Promise<{ openCount: number; declinedWork: VehicleDeclinedWork[] }> {
  try {
    const db = await getDb();
    const { data } = await db
      .from('estimates')
      .select('id, title, total, status, updated_at, category')
      .eq('shop_id', shopId)
      .eq('vehicle_id', vehicleId);

    if (!data) return { openCount: 0, declinedWork: [] };
    const rows = data as Array<{ id: string; title?: string; total?: number; status?: string; updated_at?: string; category?: string }>;

    const openCount = rows.filter(r => r.status === 'pending').length;
    const declinedWork: VehicleDeclinedWork[] = rows
      .filter(r => r.status === 'declined')
      .map(r => ({
        estimateId:       r.id,
        title:            r.title ?? 'Estimate',
        total:            Number(r.total ?? 0),
        declinedAt:       r.updated_at ?? new Date().toISOString(),
        daysSinceDecline: Math.floor((Date.now() - new Date(r.updated_at ?? Date.now()).getTime()) / 86_400_000),
        category:         r.category ?? '',
      }));

    return { openCount, declinedWork };
  } catch { return { openCount: 0, declinedWork: [] }; }
}

export async function extractInvoiceHistory(
  shopId: string,
  vehicleId: string,
): Promise<{ unpaidCount: number; totalRevenue: number; avgInvoice: number }> {
  try {
    const db = await getDb();
    const { data } = await db
      .from('invoices')
      .select('total, status')
      .eq('shop_id', shopId)
      .eq('vehicle_id', vehicleId);

    if (!data) return { unpaidCount: 0, totalRevenue: 0, avgInvoice: 0 };
    const rows = data as Array<{ total?: number; status?: string }>;
    const unpaidCount = rows.filter(r => r.status !== 'paid').length;
    const paidTotals  = rows.filter(r => r.status === 'paid').map(r => Number(r.total ?? 0));
    const totalRevenue = paidTotals.reduce((a, b) => a + b, 0);
    const avgInvoice  = paidTotals.length > 0 ? totalRevenue / paidTotals.length : 0;

    return { unpaidCount, totalRevenue, avgInvoice };
  } catch { return { unpaidCount: 0, totalRevenue: 0, avgInvoice: 0 }; }
}

export async function extractComebackHistory(
  shopId: string,
  vehicleId: string,
): Promise<{ comebackCount: number; warrantyCount: number }> {
  try {
    const db = await getDb();
    const { data } = await db
      .from('repair_orders')
      .select('id, is_warranty')
      .eq('shop_id', shopId)
      .eq('vehicle_id', vehicleId);
    const rows = (data ?? []) as Array<{ is_warranty?: boolean }>;
    const warrantyCount  = rows.filter(r => r.is_warranty).length;
    return { comebackCount: warrantyCount, warrantyCount };
  } catch { return { comebackCount: 0, warrantyCount: 0 }; }
}

export async function extractDtcPatterns(
  shopId: string,
  vehicleId: string,
): Promise<VehicleDtcPattern[]> {
  try {
    const db = await getDb();
    const { data } = await db
      .from('repair_cases')
      .select('dtc_codes, created_at, status')
      .eq('shop_id', shopId)
      .eq('vehicle_id', vehicleId)
      .not('dtc_codes', 'is', null);

    if (!data) return [];
    const dtcMap: Record<string, { count: number; firstSeen: string; lastSeen: string; resolved: boolean }> = {};

    for (const row of data as Array<{ dtc_codes?: string[] | null; created_at: string; status?: string }>) {
      for (const code of (row.dtc_codes ?? [])) {
        if (!dtcMap[code]) dtcMap[code] = { count: 0, firstSeen: row.created_at, lastSeen: row.created_at, resolved: false };
        dtcMap[code].count++;
        if (row.created_at < dtcMap[code].firstSeen) dtcMap[code].firstSeen = row.created_at;
        if (row.created_at > dtcMap[code].lastSeen)  dtcMap[code].lastSeen  = row.created_at;
        if (row.status === 'resolved') dtcMap[code].resolved = true;
      }
    }

    return Object.entries(dtcMap).map(([code, v]) => ({
      code, description: '', count: v.count,
      firstSeen: v.firstSeen, lastSeen: v.lastSeen, resolved: v.resolved,
    }));
  } catch { return []; }
}

export async function extractConcernPatterns(
  shopId: string,
  vehicleId: string,
): Promise<VehicleRepairPattern[]> {
  // Already computed in extractRepairCaseHistory — delegate
  const { concerns } = await extractRepairCaseHistory(shopId, vehicleId);
  return concerns;
}

export async function extractPartPatterns(
  shopId: string,
  vehicleId: string,
): Promise<VehiclePartPattern[]> {
  try {
    const db = await getDb();
    const { data } = await db
      .from('parts_order_items')
      .select('part_name, created_at')
      .eq('shop_id', shopId)
      .eq('vehicle_id', vehicleId);

    if (!data) return [];
    const map: Record<string, { count: number; lastUsed: string }> = {};
    for (const r of data as Array<{ part_name?: string; created_at: string }>) {
      const name = r.part_name ?? 'Unknown';
      if (!map[name]) map[name] = { count: 0, lastUsed: r.created_at };
      map[name].count++;
      if (r.created_at > map[name].lastUsed) map[name].lastUsed = r.created_at;
    }
    return Object.entries(map)
      .map(([partName, v]) => ({ partName, count: v.count, lastUsed: v.lastUsed }))
      .sort((a, b) => b.count - a.count);
  } catch { return []; }
}

export async function extractDeclinedWork(
  shopId: string,
  vehicleId: string,
): Promise<VehicleDeclinedWork[]> {
  const { declinedWork } = await extractEstimateHistory(shopId, vehicleId);
  return declinedWork;
}

export async function extractRepairLessons(
  shopId: string,
  vehicleId: string,
): Promise<VehicleRepairLesson[]> {
  const { lessons } = await extractRepairCaseHistory(shopId, vehicleId);
  return lessons;
}

// ── Signal persistence ────────────────────────────────────────

async function saveSignals(
  shopId: string,
  vehicleId: string,
  signals: VehicleIntelligenceSignal[],
): Promise<void> {
  try {
    const db = await getDb();
    const now = new Date().toISOString();
    // Deactivate old signals first
    await db.from('vehicle_intelligence_signals')
      .update({ is_active: false, updated_at: now })
      .eq('shop_id', shopId)
      .eq('vehicle_id', vehicleId);

    if (signals.length === 0) return;
    await db.from('vehicle_intelligence_signals').insert(
      signals.map(s => ({
        shop_id:     shopId,
        vehicle_id:  vehicleId,
        signal_key:  s.signalKey,
        signal_type: s.signalType,
        severity:    s.severity,
        title:       s.title,
        description: s.description ?? null,
        confidence:  s.confidence,
        source_type: s.sourceType ?? null,
        source_id:   s.sourceId   ?? null,
        metadata:    s.metadata ?? {},
        is_active:   true,
        created_at:  now,
        updated_at:  now,
      })),
    );
  } catch { /* fail silently */ }
}

// ── Save / Get ────────────────────────────────────────────────

export async function saveVehicleIntelligence(
  profile: VehicleIntelligenceProfile,
): Promise<void> {
  try {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.from('vehicle_intelligence_profiles').upsert({
      shop_id:                  profile.shopId,
      vehicle_id:               profile.vehicleId,
      health_score:             profile.healthScore,
      intelligence_status:      profile.intelligenceStatus,
      visit_count:              profile.visitCount,
      completed_repair_count:   profile.completedRepairCount,
      repair_case_count:        profile.repairCaseCount,
      open_estimate_count:      profile.openEstimateCount,
      declined_estimate_count:  profile.declinedEstimateCount,
      unpaid_invoice_count:     profile.unpaidInvoiceCount,
      comeback_count:           profile.comebackCount,
      warranty_count:           profile.warrantyCount,
      total_revenue:            profile.totalRevenue,
      average_invoice_value:    profile.averageInvoiceValue,
      last_visit_at:            profile.lastVisitAt,
      last_completed_repair_at: profile.lastCompletedRepairAt,
      latest_mileage:           profile.latestMileage,
      common_concerns:          profile.commonConcerns,
      common_dtcs:              profile.commonDtcs,
      common_repairs:           profile.commonRepairs,
      common_parts:             profile.commonParts,
      declined_work:            profile.declinedWork,
      repair_lessons:           profile.repairLessons,
      risk_signals:             profile.riskSignals,
      recommended_checks:       profile.recommendedChecks,
      metadata:                 profile.metadata,
      calculated_at:            profile.calculatedAt,
      updated_at:               now,
    }, { onConflict: 'shop_id,vehicle_id' });
  } catch { /* fail silently — never block vehicle page */ }
}

export async function getVehicleIntelligence(
  shopId: string,
  vehicleId: string,
): Promise<VehicleIntelligenceProfile | null> {
  try {
    const db = await getDb();
    const { data } = await db
      .from('vehicle_intelligence_profiles')
      .select('*')
      .eq('shop_id', shopId)
      .eq('vehicle_id', vehicleId)
      .maybeSingle();
    if (!data) return null;
    return mapProfileRow(data as Record<string, unknown>);
  } catch { return null; }
}

function mapProfileRow(r: Record<string, unknown>): VehicleIntelligenceProfile {
  const { score, status: healthStatus } = { score: Number(r.health_score ?? 0), status: 'unknown' as const };
  return {
    id:                     r.id as string,
    shopId:                 r.shop_id as string,
    vehicleId:              r.vehicle_id as string,
    healthScore:            r.health_score != null ? Number(r.health_score) : null,
    healthStatus:           (r.health_status as typeof healthStatus) ?? 'unknown',
    intelligenceStatus:     (r.intelligence_status as VehicleIntelligenceStatus) ?? 'limited',
    visitCount:             Number(r.visit_count ?? 0),
    completedRepairCount:   Number(r.completed_repair_count ?? 0),
    repairCaseCount:        Number(r.repair_case_count ?? 0),
    openEstimateCount:      Number(r.open_estimate_count ?? 0),
    declinedEstimateCount:  Number(r.declined_estimate_count ?? 0),
    unpaidInvoiceCount:     Number(r.unpaid_invoice_count ?? 0),
    comebackCount:          Number(r.comeback_count ?? 0),
    warrantyCount:          Number(r.warranty_count ?? 0),
    totalRevenue:           Number(r.total_revenue ?? 0),
    averageInvoiceValue:    Number(r.average_invoice_value ?? 0),
    lastVisitAt:            (r.last_visit_at as string | null) ?? null,
    lastCompletedRepairAt:  (r.last_completed_repair_at as string | null) ?? null,
    latestMileage:          r.latest_mileage != null ? Number(r.latest_mileage) : null,
    commonConcerns:         ((r.common_concerns as VehicleRepairPattern[] | null) ?? []),
    commonDtcs:             ((r.common_dtcs as VehicleDtcPattern[] | null) ?? []),
    commonRepairs:          ((r.common_repairs as VehicleRepairPattern[] | null) ?? []),
    commonParts:            ((r.common_parts as VehiclePartPattern[] | null) ?? []),
    declinedWork:           ((r.declined_work as VehicleDeclinedWork[] | null) ?? []),
    repairLessons:          ((r.repair_lessons as VehicleRepairLesson[] | null) ?? []),
    riskSignals:            ((r.risk_signals as VehicleRiskSignal[] | null) ?? []),
    recommendedChecks:      ((r.recommended_checks as VehicleRecommendedCheck[] | null) ?? []),
    metadata:               (r.metadata as Record<string, unknown>) ?? {},
    calculatedAt:           r.calculated_at as string,
    createdAt:              r.created_at as string,
    updatedAt:              r.updated_at as string,
  };
  void score; // suppress unused warning — health recalculated live
}

// ── Core build ────────────────────────────────────────────────

export async function buildVehicleIntelligence(
  shopId: string,
  vehicleId: string,
  dryRun = false,
): Promise<VehicleIntelligenceBuildResult> {
  const start = Date.now();
  const warnings: string[] = [];
  const now = new Date().toISOString();

  try {
    // Parallel extraction — each is independently safe
    const [
      visitData,
      repairData,
      caseData,
      estimateData,
      invoiceData,
      comebackData,
      dtcs,
      parts,
    ] = await Promise.all([
      extractVisitHistory(shopId, vehicleId).catch(() => { warnings.push('visit history unavailable'); return { visitCount: 0, lastVisitAt: null, latestMileage: null }; }),
      extractRepairHistory(shopId, vehicleId).catch(() => { warnings.push('repair history unavailable'); return { completedCount: 0, lastCompletedAt: null }; }),
      extractRepairCaseHistory(shopId, vehicleId).catch(() => { warnings.push('repair cases unavailable'); return { count: 0, concerns: [], lessons: [], comebackCount: 0 }; }),
      extractEstimateHistory(shopId, vehicleId).catch(() => { warnings.push('estimate history unavailable'); return { openCount: 0, declinedWork: [] }; }),
      extractInvoiceHistory(shopId, vehicleId).catch(() => { warnings.push('invoice history unavailable'); return { unpaidCount: 0, totalRevenue: 0, avgInvoice: 0 }; }),
      extractComebackHistory(shopId, vehicleId).catch(() => { warnings.push('comeback history unavailable'); return { comebackCount: 0, warrantyCount: 0 }; }),
      extractDtcPatterns(shopId, vehicleId).catch(() => { warnings.push('DTC patterns unavailable'); return []; }),
      extractPartPatterns(shopId, vehicleId).catch(() => { warnings.push('parts patterns unavailable'); return []; }),
    ]);

    const context: VehicleIntelligenceContext = {
      shopId,
      vehicleId,
      visitCount:            visitData.visitCount,
      completedJobCount:     repairData.completedCount,
      repairCaseCount:       caseData.count,
      comebackCount:         Math.max(caseData.comebackCount, comebackData.comebackCount),
      declinedEstimateCount: estimateData.declinedWork.length,
      unpaidInvoiceCount:    invoiceData.unpaidCount,
      openEstimateCount:     estimateData.openCount,
      concerns:              caseData.concerns,
      dtcs,
      parts,
      declinedWork:          estimateData.declinedWork,
      repairLessons:         caseData.lessons,
      latestMileage:         visitData.latestMileage,
      totalRevenue:          invoiceData.totalRevenue,
      hasCompleteHistory:    repairData.completedCount > 0 && caseData.count > 0,
    };

    // Generate signals from all rules
    const rawSignals = [
      ...ruleRepeatConcern(context.concerns),
      ...ruleRepeatDtc(dtcs),
      ...ruleUnresolvedDeclinedWork(estimateData.declinedWork),
      ...ruleComebackPattern(context.comebackCount, context.concerns),
      ruleMissingRepairIntelligence(context.completedJobCount, context.repairCaseCount),
      ruleMaintenanceCandidate(context.latestMileage, visitData.lastVisitAt),
      ruleHighValueVehicle(context.totalRevenue),
      ruleLowDataConfidence(context),
      ...rulePartsPattern(parts),
      ruleTechnicianFamiliarity(caseData.lessons),
    ].filter(Boolean);

    // Convert to VehicleIntelligenceSignal[]
    const signals: VehicleIntelligenceSignal[] = (rawSignals as NonNullable<typeof rawSignals[number]>[]).map(s => ({
      id:          '',
      shopId,
      vehicleId,
      signalKey:   s.key,
      signalType:  s.key.split('_')[0],
      severity:    s.severity,
      title:       s.title,
      description: s.description ?? null,
      confidence:  s.confidence,
      sourceType:  s.sourceType ?? null,
      sourceId:    s.sourceId ?? null,
      metadata:    {},
      isActive:    true,
      createdAt:   now,
      updatedAt:   now,
    }));

    // Health score
    const { score: healthScore, status: healthStatus } = calculateVehicleHealth(context);

    // Status
    const intelligenceStatus: VehicleIntelligenceStatus =
      visitData.visitCount === 0 ? 'limited' :
      repairData.completedCount === 0 ? 'limited' : 'ready';

    // Recommended checks
    const recommendedChecks = generateDeterministicChecks(context);

    const profile: VehicleIntelligenceProfile = {
      id:                    '',
      shopId,
      vehicleId,
      healthScore,
      healthStatus,
      intelligenceStatus,
      visitCount:            visitData.visitCount,
      completedRepairCount:  repairData.completedCount,
      repairCaseCount:       caseData.count,
      openEstimateCount:     estimateData.openCount,
      declinedEstimateCount: estimateData.declinedWork.length,
      unpaidInvoiceCount:    invoiceData.unpaidCount,
      comebackCount:         context.comebackCount,
      warrantyCount:         comebackData.warrantyCount,
      totalRevenue:          invoiceData.totalRevenue,
      averageInvoiceValue:   invoiceData.avgInvoice,
      lastVisitAt:           visitData.lastVisitAt,
      lastCompletedRepairAt: repairData.lastCompletedAt,
      latestMileage:         visitData.latestMileage,
      commonConcerns:        context.concerns,
      commonDtcs:            dtcs,
      commonRepairs:         caseData.concerns,
      commonParts:           parts,
      declinedWork:          estimateData.declinedWork,
      repairLessons:         caseData.lessons,
      riskSignals:           signals.map(s => ({
        key: s.signalKey, severity: s.severity, title: s.title,
        description: s.description ?? '', confidence: s.confidence,
        sourceType: s.sourceType ?? undefined, sourceId: s.sourceId ?? undefined,
      })),
      recommendedChecks,
      metadata:              { warnings, buildDurationMs: 0 },
      calculatedAt:          now,
      createdAt:             now,
      updatedAt:             now,
    };

    profile.metadata = { warnings, buildDurationMs: Date.now() - start };

    // Save (unless dry run)
    let isNew = false;
    if (!dryRun) {
      const existing = await getVehicleIntelligence(shopId, vehicleId);
      isNew = !existing;
      await saveVehicleIntelligence(profile);
      await saveSignals(shopId, vehicleId, signals);
    }

    const finalResult = { profile, signals, isNew, durationMs: Date.now() - start, warnings };
    // Fire-and-forget telemetry — never awaited
    void import('./VehicleIntelligenceTelemetry').then(m => m.logBuildTelemetry(shopId, vehicleId, finalResult)).catch(() => {});
    return finalResult;
  } catch (e) {
    warnings.push(`Build error: ${e instanceof Error ? e.message : 'unknown'}`);
    const fallback = buildSafeFallback(shopId, vehicleId, now, warnings);
    return { profile: fallback, signals: [], isNew: false, durationMs: Date.now() - start, warnings };
  }
}

function buildSafeFallback(
  shopId: string, vehicleId: string, now: string, warnings: string[],
): VehicleIntelligenceProfile {
  return {
    id: '', shopId, vehicleId,
    healthScore: null, healthStatus: 'unknown', intelligenceStatus: 'error',
    visitCount: 0, completedRepairCount: 0, repairCaseCount: 0,
    openEstimateCount: 0, declinedEstimateCount: 0, unpaidInvoiceCount: 0,
    comebackCount: 0, warrantyCount: 0, totalRevenue: 0, averageInvoiceValue: 0,
    lastVisitAt: null, lastCompletedRepairAt: null, latestMileage: null,
    commonConcerns: [], commonDtcs: [], commonRepairs: [], commonParts: [],
    declinedWork: [], repairLessons: [], riskSignals: [], recommendedChecks: [],
    metadata: { warnings }, calculatedAt: now, createdAt: now, updatedAt: now,
  };
}

export async function refreshVehicleIntelligence(
  shopId: string,
  vehicleId: string,
): Promise<VehicleIntelligenceBuildResult> {
  return buildVehicleIntelligence(shopId, vehicleId);
}
