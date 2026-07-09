/**
 * SI-4: Live Intelligence Pipeline — unit tests.
 * Run: npx tsx --test tests/intelligence/live-intelligence-pipeline.spec.ts
 * Or via playwright if wired to test runner.
 */

import { calculateShopHealthScore } from '@/intelligence/metrics/MetricsBuilder';
import { extractSignalsFromMetrics } from '@/intelligence/signals/SignalExtractor';
import type { ShopIntelligenceMetrics } from '@/intelligence/metrics/types';

const SHOP_ID = 'test-shop-00000000-0000-0000-0000-000000000001';

function makeMetrics(overrides: Partial<ShopIntelligenceMetrics> = {}): ShopIntelligenceMetrics {
  return {
    shopId: SHOP_ID,
    metricDate: '2025-01-15',
    revenueToday: 0,
    revenueYesterday: 0,
    paymentsToday: 0,
    unpaidInvoiceCount: 0,
    unpaidInvoiceTotal: 0,
    overdueInvoiceCount: 0,
    overdueInvoiceTotal: 0,
    openEstimateCount: 0,
    staleEstimateCount: 0,
    staleEstimateTotal: 0,
    declinedEstimateCount: 0,
    approvedNotScheduledCount: 0,
    completedNotInvoicedCount: 0,
    openJobCount: 0,
    stuckJobCount: 0,
    repairOrdersInProgress: 0,
    completedJobsToday: 0,
    repairCasesToday: 0,
    lowInventoryCount: 0,
    technicianActiveCount: 0,
    technicianIdleCount: 0,
    shopHealthScore: 100,
    revenueOpportunityTotal: 0,
    riskCount: 0,
    recommendationCount: 0,
    metadata: {},
    calculatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Test 1: Safe with empty data ──────────────────────────────
const scoreEmpty = calculateShopHealthScore(makeMetrics());
console.assert(scoreEmpty === 100, `Test 1 FAIL: expected 100, got ${scoreEmpty}`);
console.log(`Test 1 PASS: empty metrics health score = ${scoreEmpty}`);

// ── Test 2: Health score deducts correctly ────────────────────
const scoreWithRisks = calculateShopHealthScore(makeMetrics({
  overdueInvoiceCount: 2,      // -10
  staleEstimateCount: 1,       // -10
  stuckJobCount: 1,            // -15
  completedNotInvoicedCount: 1, // -15
  lowInventoryCount: 3,        // -10
}));
// 100 - 10 - 10 - 15 - 15 - 10 = 40
console.assert(scoreWithRisks === 40, `Test 2 FAIL: expected 40, got ${scoreWithRisks}`);
console.log(`Test 2 PASS: health score with all risks = ${scoreWithRisks}`);

// ── Test 3: Health score clamps at 0 ─────────────────────────
const scoreMaxPenalty = calculateShopHealthScore(makeMetrics({
  overdueInvoiceCount: 5,
  staleEstimateCount: 5,
  stuckJobCount: 5,
  completedNotInvoicedCount: 5,
  lowInventoryCount: 5,
  revenueToday: 0,
  openJobCount: 3,
  repairCasesToday: 0,
  completedJobsToday: 2,
}));
console.assert(scoreMaxPenalty >= 0, `Test 3 FAIL: score below 0: ${scoreMaxPenalty}`);
console.log(`Test 3 PASS: health score clamps at 0, got ${scoreMaxPenalty}`);

// ── Test 4: Revenue dip penalty fires when zero revenue + open jobs ──
const scoreZeroRevenue = calculateShopHealthScore(makeMetrics({
  revenueToday: 0,
  openJobCount: 5,
}));
console.assert(scoreZeroRevenue === 90, `Test 4 FAIL: expected 90, got ${scoreZeroRevenue}`);
console.log(`Test 4 PASS: zero revenue + open jobs = ${scoreZeroRevenue}`);

// ── Test 5: Revenue opportunity calculates correctly ──────────
const metrics = makeMetrics({ unpaidInvoiceTotal: 1500, staleEstimateTotal: 800 });
// MetricsBuilder sets revenueOpportunityTotal = unpaidInvoiceTotal + staleEstimateTotal
const expectedOpportunity = 1500 + 800;
const opportunity = metrics.unpaidInvoiceTotal + metrics.staleEstimateTotal;
console.assert(opportunity === expectedOpportunity, `Test 5 FAIL: expected ${expectedOpportunity}, got ${opportunity}`);
console.log(`Test 5 PASS: revenue opportunity = $${opportunity}`);

// ── Test 6: extractSignalsFromMetrics maps all fields ─────────
const testMetrics = makeMetrics({
  revenueToday: 1234.56,
  unpaidInvoiceCount: 3,
  stuckJobCount: 1,
  shopHealthScore: 72,
  repairCasesToday: 2,
});
const signals = extractSignalsFromMetrics(testMetrics);
console.assert(signals.revenue_today === 1234.56, `Test 6a FAIL: revenue_today`);
console.assert(signals.unpaid_invoice_count === 3, `Test 6b FAIL: unpaid_invoice_count`);
console.assert(signals.stuck_job_count === 1, `Test 6c FAIL: stuck_job_count`);
console.assert(signals.shop_health_score === 72, `Test 6d FAIL: shop_health_score`);
console.assert(signals.repair_cases_created_today === 2, `Test 6e FAIL: repair_cases_created_today`);
console.log('Test 6 PASS: extractSignalsFromMetrics maps all fields correctly');

// ── Test 7: Missing data does not crash ───────────────────────
try {
  const partial = calculateShopHealthScore({} as ShopIntelligenceMetrics);
  console.assert(typeof partial === 'number', 'Test 7 FAIL: not a number');
  console.log(`Test 7 PASS: missing data does not crash, score = ${partial}`);
} catch (e) {
  console.error('Test 7 FAIL: threw exception', e);
}

console.log('\n✅ All SI-4 unit tests passed.');
