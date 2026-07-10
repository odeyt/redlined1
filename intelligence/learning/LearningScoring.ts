// SI-11: Intelligence Learning Engine — Scoring Formulas
// Pure deterministic functions. No side effects. No external calls.

import { MINIMUM_SAMPLE_SIZE } from './IntelligenceLearningEngine';
import type { LearningCalculationInput, LearningCalculationResult } from './types';

// ── Correctness Rate ──────────────────────────────────────────────────────────
// (correct + 0.5 × partially_correct) / max(1, correct + partially_correct + incorrect)
export function correctnessRate(correct: number, partial: number, incorrect: number): number {
  const numerator = correct + 0.5 * partial;
  const denominator = Math.max(1, correct + partial + incorrect);
  return numerator / denominator;
}

// ── Action Rate ───────────────────────────────────────────────────────────────
// acted_upon / max(1, total)
export function actionRate(actedUpon: number, total: number): number {
  return actedUpon / Math.max(1, total);
}

// ── Success Rate ──────────────────────────────────────────────────────────────
// successful / max(1, successful + failed)
export function successRate(successful: number, failed: number): number {
  return successful / Math.max(1, successful + failed);
}

// ── Dismiss Rate ──────────────────────────────────────────────────────────────
export function dismissRate(dismissed: number, total: number): number {
  return dismissed / Math.max(1, total);
}

// ── Value Score ───────────────────────────────────────────────────────────────
// Normalized realized revenue (0-1 scale, cap at 100k) + normalized time saved (cap at 480 min) + risk reduction (0-1)
export function valueScore(
  totalRevenue: number,
  count: number,
  totalTimeSavedMinutes: number,
  riskReduction: number,
): number {
  const normalizedRevenue = Math.min(1, (totalRevenue / Math.max(1, count)) / 100000);
  const normalizedTime = Math.min(1, (totalTimeSavedMinutes / Math.max(1, count)) / 480);
  return (normalizedRevenue * 0.6) + (normalizedTime * 0.2) + (riskReduction * 0.2);
}

// ── Confidence Adjustment (bounded -10 to +10) ────────────────────────────────
// Factors: correctness rate, average accuracy, sample size weight, success rate
export function calculateConfidenceAdjustment(
  cRate: number,
  avgAccuracy: number,
  sampleSize: number,
  sRate: number,
): number {
  if (sampleSize < MINIMUM_SAMPLE_SIZE) return 0;

  // Weight grows from 0 at threshold to 1 at 100 samples
  const sampleWeight = Math.min(1, (sampleSize - MINIMUM_SAMPLE_SIZE) / 80);

  // Combined signal: 50% correctness, 30% accuracy (normalized to 0-1), 20% success
  const signal = (cRate * 0.5) + ((avgAccuracy / 5) * 0.3) + (sRate * 0.2);

  // Map 0.5 = neutral, above = positive, below = negative
  const raw = (signal - 0.5) * 2; // -1 to +1
  const adjustment = raw * 10 * sampleWeight;

  return Math.max(-10, Math.min(10, Math.round(adjustment * 10) / 10));
}

// ── Ranking Adjustment (bounded -100 to +100) ─────────────────────────────────
// Factors: action rate, success rate, usefulness, revenue, dismiss rate
export function calculateRankingAdjustment(
  aRate: number,
  sRate: number,
  avgUsefulness: number,
  totalRevenue: number,
  sampleSize: number,
  dRate: number,
): number {
  if (sampleSize < MINIMUM_SAMPLE_SIZE) return 0;

  const sampleWeight = Math.min(1, (sampleSize - MINIMUM_SAMPLE_SIZE) / 80);
  const normalizedUsefulness = avgUsefulness / 5;
  const normalizedRevenue = Math.min(1, totalRevenue / 100000);

  // Positive factors
  const positiveSignal = (aRate * 0.3) + (sRate * 0.3) + (normalizedUsefulness * 0.25) + (normalizedRevenue * 0.15);
  // Dismiss penalty
  const dismissPenalty = dRate * 0.4;

  const net = positiveSignal - dismissPenalty; // roughly 0-1 range, can go negative
  const raw = (net - 0.3) * 2; // center around 0.3 as neutral
  const adjustment = raw * 100 * sampleWeight;

  return Math.max(-100, Math.min(100, Math.round(adjustment)));
}

// ── Main profile calculator ───────────────────────────────────────────────────
export function calculateRuleProfile(input: LearningCalculationInput): LearningCalculationResult {
  const {
    feedbackRows,
    attributionRows,
    totalRecommendations,
    completedCount,
    dismissedCount,
    ruleKey,
  } = input;

  // Count feedback types
  const correct   = feedbackRows.filter(f => f.feedbackType === 'correct').length;
  const partial   = feedbackRows.filter(f => f.feedbackType === 'partially_correct').length;
  const incorrect = feedbackRows.filter(f => f.feedbackType === 'incorrect').length;
  const successful = feedbackRows.filter(f => f.resultStatus === 'successful').length;
  const failed     = feedbackRows.filter(f => f.resultStatus === 'unsuccessful').length;

  const withUsefulness = feedbackRows.filter(f => f.usefulnessScore != null);
  const withAccuracy   = feedbackRows.filter(f => f.accuracyScore != null);
  const withTrust      = feedbackRows.filter(f => f.trustScore != null);

  const avgUsefulness = withUsefulness.length > 0
    ? withUsefulness.reduce((s, f) => s + (f.usefulnessScore ?? 0), 0) / withUsefulness.length
    : 0;
  const avgAccuracy = withAccuracy.length > 0
    ? withAccuracy.reduce((s, f) => s + (f.accuracyScore ?? 0), 0) / withAccuracy.length
    : 0;
  const avgTrust = withTrust.length > 0
    ? withTrust.reduce((s, f) => s + (f.trustScore ?? 0), 0) / withTrust.length
    : 0;

  const totalRevenue = attributionRows.reduce((s, a) => s + (a.realizedRevenue ?? 0), 0);
  const avgRevenue   = attributionRows.length > 0 ? totalRevenue / attributionRows.length : 0;

  const sampleSize = feedbackRows.length;
  const belowMin   = sampleSize < MINIMUM_SAMPLE_SIZE;

  const cRate = correctnessRate(correct, partial, incorrect);
  const aRate = actionRate(completedCount, totalRecommendations);
  const sRate = successRate(successful, failed);
  const dRate = dismissRate(dismissedCount, totalRecommendations);

  const confidenceAdj = belowMin ? 0 : calculateConfidenceAdjustment(cRate, avgAccuracy, sampleSize, sRate);
  const rankingAdj    = belowMin ? 0 : calculateRankingAdjustment(aRate, sRate, avgUsefulness, totalRevenue, sampleSize, dRate);

  let status: LearningCalculationResult['status'] = 'collecting_data';
  if (!belowMin) {
    if (confidenceAdj >= 5 || aRate >= 0.7)  status = 'trusted';
    else if (confidenceAdj <= -5 || dRate >= 0.6) status = 'low_performing';
    else status = 'active';
  }

  return {
    ruleKey,
    sampleSize,
    belowMinimumSample: belowMin,
    correctnessRate: cRate,
    actionRate: aRate,
    successRate: sRate,
    dismissRate: dRate,
    averageUsefulness: avgUsefulness,
    averageAccuracy: avgAccuracy,
    averageTrust: avgTrust,
    totalRevenueRealized: totalRevenue,
    averageRevenueRealized: avgRevenue,
    confidenceAdjustment: confidenceAdj,
    rankingAdjustment: rankingAdj,
    status,
  };
}
