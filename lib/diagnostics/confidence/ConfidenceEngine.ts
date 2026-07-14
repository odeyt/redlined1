/**
 * lib/diagnostics/confidence/ConfidenceEngine.ts
 *
 * Deterministic confidence scoring — never uses raw AI probabilities.
 * Score is calculated from evidence quality, quantity, and repair verification.
 * AI-only sessions are capped at LEADING_HYPOTHESIS (79).
 */

import type { DiagnosticSession, DiagnosticConfidenceResult, ConfidenceBand } from '../types';

function scoreToBand(score: number): ConfidenceBand {
  if (score >= 95) return 'CONFIRMED';
  if (score >= 80) return 'STRONGLY_SUPPORTED';
  if (score >= 60) return 'LEADING_HYPOTHESIS';
  if (score >= 40) return 'POSSIBLE';
  return 'WEAK_HYPOTHESIS';
}

export function calculateConfidence(session: DiagnosticSession): DiagnosticConfidenceResult {
  const now = new Date().toISOString();
  const positiveFactors: string[] = [];
  const negativeFactors: string[] = [];

  let score = 0;
  let totalWeight = 0;

  // DTC evidence
  const confirmedDtcs = session.dtcs.filter((d) => d.type === 'CONFIRMED');
  if (confirmedDtcs.length > 0) {
    score += 20;
    positiveFactors.push(`${confirmedDtcs.length} confirmed DTC(s) present`);
  } else {
    negativeFactors.push('No confirmed DTCs');
  }
  totalWeight += 20;

  // Freeze frame evidence
  if (session.freezeFrames.length > 0) {
    score += 10;
    positiveFactors.push('Freeze frame data captured');
  } else {
    negativeFactors.push('No freeze frame data');
  }
  totalWeight += 10;

  // Live data
  if (session.liveDataCaptures.length > 0) {
    score += 15;
    positiveFactors.push('Live data captured');
  } else {
    negativeFactors.push('No live data captured');
  }
  totalWeight += 15;

  // Test results
  const passedTests = session.testResults.filter((t) => t.outcome === 'PASS' || t.outcome === 'FAIL');
  if (passedTests.length > 0) {
    score += Math.min(passedTests.length * 10, 25);
    positiveFactors.push(`${passedTests.length} completed test result(s)`);
  } else {
    negativeFactors.push('No test results recorded');
  }
  totalWeight += 25;

  // Evidence quality
  const highQualityEvidence = session.evidence.filter((e) => e.quality === 'HIGH');
  if (highQualityEvidence.length >= 2) {
    score += 15;
    positiveFactors.push('Multiple high-quality evidence items');
  } else if (highQualityEvidence.length === 1) {
    score += 8;
    positiveFactors.push('One high-quality evidence item');
  } else {
    negativeFactors.push('No high-quality evidence');
  }
  totalWeight += 15;

  // Repair verification
  const hasRepairVerification = !!session.repairVerification?.complaintResolved;
  if (hasRepairVerification) {
    score += 15;
    positiveFactors.push('Repair verified — complaint resolved');
  }
  totalWeight += 15;

  const evidenceCompleteness = totalWeight > 0 ? score / totalWeight : 0;

  // Raw score as 0–100
  let finalScore = Math.round(score);

  // AI-only sessions cannot exceed LEADING_HYPOTHESIS (79)
  const hasAiReasoningOnly = session.reasoningRuns.length > 0 && passedTests.length === 0;
  if (hasAiReasoningOnly && finalScore > 79) {
    finalScore = 79;
    negativeFactors.push('Score capped at 79 — AI inference only, no technician-confirmed tests');
  }

  // Cannot reach CONFIRMED without repair verification
  if (!hasRepairVerification && finalScore >= 95) {
    finalScore = 94;
    negativeFactors.push('Score capped at 94 — repair verification required for CONFIRMED');
  }

  const confirmationStatus = hasRepairVerification
    ? 'CONFIRMED'
    : passedTests.length > 0
    ? 'PARTIALLY_CONFIRMED'
    : 'UNCONFIRMED';

  return {
    score: finalScore,
    band: scoreToBand(finalScore),
    evidenceCompleteness,
    confirmationStatus,
    positiveFactors,
    negativeFactors,
    isAiInferenceOnly: hasAiReasoningOnly,
    hasRepairVerification,
    calculatedAt: now,
  };
}
