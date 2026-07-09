// SI-6: Executive Decision Engine
// Deterministic. No AI. No external calls. Never crashes Command Center.

import type {
  DecisionScore, RankedAction, ActionQueue, ExecutiveScore,
  TodaysImpact, QuickAction,
} from './types';
import type { Recommendation } from '../recommendations/types';
import { scoreRecommendation } from './ScoringModel';

type SignalMap = Record<string, number | string | null>;

// ── Quick Actions per recommendation key ─────────────────────
function buildQuickActions(rec: Recommendation): QuickAction[] {
  const actions: QuickAction[] = [];
  switch (rec.recommendationKey) {
    case 'unpaid_invoices':
      actions.push({ type: 'open_invoice', label: 'View Invoices', module: 'invoices' });
      break;
    case 'stale_estimates':
    case 'declined_estimate_winback':
    case 'approved_estimate_not_scheduled':
      actions.push({ type: 'open_estimate', label: 'View Estimates', module: 'estimates' });
      break;
    case 'completed_job_not_invoiced':
    case 'stuck_repair_order':
      actions.push({ type: 'open_job', label: 'View Job Cards', module: 'job-cards' });
      break;
    case 'low_inventory':
      actions.push({ type: 'open_inventory', label: 'View Parts', module: 'parts' });
      break;
    case 'inactive_customers':
      actions.push({ type: 'open_customer', label: 'View Customers', module: 'customers' });
      break;
    case 'repair_intelligence_missing':
      actions.push({ type: 'open_repair_order', label: 'View Repair Cases', module: 'repair-cases' });
      break;
    case 'revenue_dip':
      actions.push({ type: 'open_invoice', label: 'Check Invoices', module: 'invoices' });
      actions.push({ type: 'open_job', label: 'Check Jobs', module: 'job-cards' });
      break;
  }
  actions.push({ type: 'view_evidence', label: 'Evidence & Actions' });
  actions.push({ type: 'mark_complete', label: 'Done' });
  actions.push({ type: 'dismiss', label: 'Dismiss' });
  return actions;
}

// ── Why It Matters (top-level) ────────────────────────────────
function whyItMatters(key: string): string {
  const MAP: Record<string, string> = {
    completed_job_not_invoiced: 'Work is complete but revenue is uncollected. Creating the invoice takes 10 minutes and converts labour directly into cash.',
    unpaid_invoices:            'Unpaid invoices reduce available cash. Prompt follow-up shortens payment cycles and reduces write-off risk.',
    stale_estimates:            'Estimates older than 3 days convert at lower rates. A quick follow-up call significantly improves close rate.',
    stuck_repair_order:         'Stuck jobs block technician throughput and delay invoicing. Reassigning or escalating unblocks the pipeline.',
    low_inventory:              'Out-of-stock parts cause job delays, technician downtime, and customer dissatisfaction.',
    approved_estimate_not_scheduled: 'Approved estimates mean customers said yes. Scheduling immediately captures committed revenue.',
    declined_estimate_winback:  'Declined customers are often receptive to alternatives. A lower-cost package may still close the job.',
    inactive_customers:         'Inactive customers are cheaper to re-engage than new customers. A maintenance reminder is a high-ROI action.',
    repair_intelligence_missing: 'Recording repair cases builds institutional knowledge that reduces diagnostic time on future similar jobs.',
    revenue_dip:                'Revenue gaps compound quickly. Investigating the cause now prevents a multi-day shortfall.',
  };
  return MAP[key] ?? 'Addressing this improves shop performance and revenue.';
}

// ── Expected Impact text ──────────────────────────────────────
function expectedImpact(rec: Recommendation, score: DecisionScore): string {
  if (rec.estimatedRevenue && rec.estimatedRevenue > 0) {
    return `Potential revenue impact: up to $${rec.estimatedRevenue.toLocaleString()}. Decision score: ${score.decisionScore}/1000.`;
  }
  return `Decision score: ${score.decisionScore}/1000. Addressing this reduces operational risk.`;
}

// ── calculateDecisionScore ────────────────────────────────────
export function calculateDecisionScore(rec: Recommendation, signals: SignalMap): DecisionScore {
  const { subScores, rawScore, confidenceMultiplier, decisionScore, estimatedTimeMinutes, rationale } =
    scoreRecommendation(rec, signals);

  return {
    recommendationId: rec.id ?? rec.recommendationKey,
    recommendationKey: rec.recommendationKey,
    shopId: rec.shopId,
    subScores,
    rawScore,
    confidenceMultiplier,
    decisionScore,
    estimatedRevenue: rec.estimatedRevenue ?? null,
    estimatedTimeMinutes,
    rationale,
  };
}

// ── rankRecommendations ───────────────────────────────────────
export function rankRecommendations(
  recommendations: Recommendation[],
  signals: SignalMap,
  limit = 5,
): RankedAction[] {
  if (recommendations.length === 0) return [];

  const scored = recommendations.map(rec => ({
    rec,
    score: calculateDecisionScore(rec, signals),
  }));

  // Sort by decision score descending, break ties by urgency score
  scored.sort((a, b) => {
    const scoreDiff = b.score.decisionScore - a.score.decisionScore;
    if (Math.abs(scoreDiff) > 5) return scoreDiff;
    return b.score.subScores.urgencyScore - a.score.subScores.urgencyScore;
  });

  return scored.slice(0, limit).map(({ rec, score }, idx) => ({
    rank: idx + 1,
    recommendation: rec,
    score,
    quickActions: buildQuickActions(rec),
    whyItMatters: whyItMatters(rec.recommendationKey),
    expectedImpact: expectedImpact(rec, score),
  }));
}

// Convenience filters
export function rankRevenue(recs: Recommendation[], signals: SignalMap): RankedAction[] {
  const revenueKeys = ['completed_job_not_invoiced', 'unpaid_invoices', 'stale_estimates', 'approved_estimate_not_scheduled', 'revenue_dip'];
  return rankRecommendations(recs.filter(r => revenueKeys.includes(r.recommendationKey)), signals);
}

export function rankRisk(recs: Recommendation[], signals: SignalMap): RankedAction[] {
  const riskKeys = ['stuck_repair_order', 'low_inventory', 'revenue_dip'];
  return rankRecommendations(recs.filter(r => riskKeys.includes(r.recommendationKey)), signals);
}

export function rankEfficiency(recs: Recommendation[], signals: SignalMap): RankedAction[] {
  const effKeys = ['stuck_repair_order', 'approved_estimate_not_scheduled', 'completed_job_not_invoiced'];
  return rankRecommendations(recs.filter(r => effKeys.includes(r.recommendationKey)), signals);
}

export function rankCashflow(recs: Recommendation[], signals: SignalMap): RankedAction[] {
  const cashKeys = ['unpaid_invoices', 'completed_job_not_invoiced', 'stale_estimates'];
  return rankRecommendations(recs.filter(r => cashKeys.includes(r.recommendationKey)), signals);
}

export function rankKnowledge(recs: Recommendation[], signals: SignalMap): RankedAction[] {
  const kKeys = ['repair_intelligence_missing'];
  return rankRecommendations(recs.filter(r => kKeys.includes(r.recommendationKey)), signals);
}

// ── buildActionQueue ──────────────────────────────────────────
export function buildActionQueue(
  shopId: string,
  recommendations: Recommendation[],
  signals: SignalMap,
): ActionQueue {
  const rankedActions = rankRecommendations(recommendations, signals, 5);
  return {
    shopId,
    date: new Date().toISOString().split('T')[0],
    rankedActions,
    totalOpenRecommendations: recommendations.length,
    generatedAt: new Date().toISOString(),
  };
}

// ── calculateExecutiveScore (0–100) ──────────────────────────
export function calculateExecutiveScore(signals: SignalMap): ExecutiveScore {
  const unpaidCount      = Number(signals.unpaid_invoice_count ?? 0);
  const unpaidTotal      = Number(signals.unpaid_invoice_total ?? 0);
  const overdueCount     = Number(signals.overdue_invoice_count ?? 0);
  const stuckJobs        = Number(signals.stuck_job_count ?? 0);
  const openJobs         = Number(signals.open_job_count ?? 0);
  const completedNotInv  = Number(signals.completed_not_invoiced_count ?? 0);
  const lowInvCount      = Number(signals.low_inventory_count ?? 0);
  const staleEstimates   = Number(signals.stale_estimate_count ?? 0);
  const repairCases      = Number(signals.repair_cases_created_today ?? 0);
  const revenueToday     = Number(signals.revenue_today ?? 0);
  const revenueYesterday = Number(signals.revenue_yesterday ?? 0);

  // Revenue Health (0–25): good revenue today = high score
  let revenueHealth = 25;
  if (overdueCount > 0) revenueHealth -= Math.min(overdueCount * 3, 10);
  if (unpaidCount > 5)  revenueHealth -= 5;
  if (revenueYesterday > 0 && revenueToday < revenueYesterday * 0.5) revenueHealth -= 8;
  revenueHealth = Math.max(0, revenueHealth);

  // Efficiency (0–25): no stuck/uninvoiced jobs = high score
  let efficiency = 25;
  if (stuckJobs > 0)       efficiency -= Math.min(stuckJobs * 3, 12);
  if (completedNotInv > 0) efficiency -= Math.min(completedNotInv * 4, 10);
  if (openJobs > 15)       efficiency -= 3;
  efficiency = Math.max(0, efficiency);

  // Risk Control (0–20): no inventory gaps, no safety issues
  let riskControl = 20;
  if (lowInvCount > 100) riskControl -= 10;
  else if (lowInvCount > 50) riskControl -= 7;
  else if (lowInvCount > 10) riskControl -= 4;
  if (overdueCount > 0) riskControl -= Math.min(overdueCount * 2, 6);
  riskControl = Math.max(0, riskControl);

  // Cash Flow (0–20): quick payment cycles = high score
  let cashFlow = 20;
  if (unpaidTotal > 10000) cashFlow -= 10;
  else if (unpaidTotal > 5000) cashFlow -= 6;
  else if (unpaidTotal > 1000) cashFlow -= 3;
  if (staleEstimates > 3) cashFlow -= Math.min(staleEstimates, 5);
  cashFlow = Math.max(0, cashFlow);

  // Knowledge Growth (0–10): repair cases = institutional knowledge
  let knowledgeGrowth = repairCases >= 2 ? 10 : repairCases === 1 ? 7 : 3;

  const overall = Math.round(revenueHealth + efficiency + riskControl + cashFlow + knowledgeGrowth);

  // Trend (simplified: compare to a neutral baseline of 70)
  const trend: 'up' | 'down' | 'stable' =
    overall >= 75 ? 'up' : overall <= 55 ? 'down' : 'stable';

  return {
    overall,
    revenueHealth,
    efficiency,
    riskControl,
    cashFlow,
    knowledgeGrowth,
    trend,
    breakdown: {
      revenueExplain: overdueCount > 0
        ? `${overdueCount} overdue invoice${overdueCount > 1 ? 's' : ''} impacting revenue health.`
        : revenueToday > 0 ? `Revenue is active today.` : 'No revenue recorded today yet.',
      efficiencyExplain: stuckJobs > 0
        ? `${stuckJobs} stuck job${stuckJobs > 1 ? 's' : ''} reducing throughput.`
        : 'Job pipeline is flowing.',
      riskExplain: lowInvCount > 50
        ? `${lowInvCount} low-inventory items creating supply risk.`
        : lowInvCount > 0 ? `${lowInvCount} parts at low stock.` : 'Inventory levels are healthy.',
      cashFlowExplain: unpaidTotal > 0
        ? `$${unpaidTotal.toLocaleString()} in unpaid invoices outstanding.`
        : 'No outstanding unpaid invoices.',
      knowledgeExplain: repairCases >= 2
        ? `${repairCases} repair cases recorded today.`
        : repairCases === 1 ? '1 repair case recorded today.'
        : 'No repair cases recorded today.',
    },
  };
}

// ── calculateTodaysImpact ─────────────────────────────────────
export function calculateTodaysImpact(
  signals: SignalMap,
  rankedActions: RankedAction[],
): TodaysImpact {
  const unpaidTotal     = Number(signals.unpaid_invoice_total ?? 0);
  const staleTotal      = Number(signals.stale_estimate_total ?? 0);
  const staleCount      = Number(signals.stale_estimate_count ?? 0);
  const completedNotInv = Number(signals.completed_not_invoiced_count ?? 0);
  const openJobs        = Number(signals.open_job_count ?? 0);

  // Potential revenue = collect unpaid + invoice completed jobs (estimate ~$200/job)
  const potentialRevenueToday = rankedActions.reduce((sum, a) =>
    sum + (a.recommendation.estimatedRevenue ?? 0), 0,
  );

  return {
    potentialRevenueToday: Math.round(potentialRevenueToday),
    potentialCashCollection: Math.round(unpaidTotal),
    potentialJobsClosed: Math.max(completedNotInv, 0),
    potentialEstimatesConverted: Math.round(staleCount * 0.3), // 30% conversion estimate
    potentialKnowledgeAdded: Math.min(openJobs, 5),
  };
}

// ── Persist to DB (fire-and-forget) ──────────────────────────
export async function saveDecisionRanking(
  shopId: string,
  queue: ActionQueue,
  execScore: ExecutiveScore,
  impact: TodaysImpact,
): Promise<void> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const today = new Date().toISOString().split('T')[0];
    await db.from('decision_rankings').upsert({
      shop_id:                      shopId,
      ranking_date:                 today,
      ranked_actions:               queue.rankedActions,
      executive_score:              execScore.overall,
      potential_revenue_today:      impact.potentialRevenueToday,
      potential_cash_collection:    impact.potentialCashCollection,
      potential_jobs_closed:        impact.potentialJobsClosed,
      potential_estimates_converted: impact.potentialEstimatesConverted,
      potential_knowledge_added:    impact.potentialKnowledgeAdded,
      generated_at:                 new Date().toISOString(),
      updated_at:                   new Date().toISOString(),
    }, { onConflict: 'shop_id,ranking_date' });
  } catch { /* fire-and-forget — never crash caller */ }
}

export async function saveDecisionHistory(
  shopId: string,
  recommendationId: string,
  recommendationKey: string,
  decisionScore: number,
  rank: number,
  actionTaken: string,
  revenueRealized?: number,
): Promise<void> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    await db.from('decision_history').insert({
      shop_id:           shopId,
      recommendation_id: recommendationId,
      recommendation_key: recommendationKey,
      decision_score:    decisionScore,
      rank,
      action_taken:      actionTaken,
      revenue_realized:  revenueRealized ?? null,
      acted_at:          new Date().toISOString(),
    });
  } catch { /* fire-and-forget */ }
}
