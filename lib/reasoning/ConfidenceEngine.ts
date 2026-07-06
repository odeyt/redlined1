/**
 * RedlineD1 — Confidence Engine
 * Sprint 6 — ERE Part 4
 *
 * Computes explainable confidence scores from evidence.
 * Every confidence number must be traceable to specific evidence.
 */

import {
  Evidence,
  ConfidenceResult,
  ConfidenceBreakdown,
  SimilarRepairSummary,
} from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_CONFIDENCE = 40;  // Starting point before evidence
const MAX_CONFIDENCE  = 98;  // Never 100 — there's always uncertainty
const MIN_CONFIDENCE  = 0;

// ─── Main ─────────────────────────────────────────────────────────────────────

export class ConfidenceEngine {

  /**
   * Calculate overall confidence from collected evidence.
   * Returns an explainable breakdown so technicians understand WHY.
   */
  calculate(
    evidence: Evidence[],
    similarRepairs: SimilarRepairSummary[] = [],
    verificationStatus: string = 'pending',
  ): ConfidenceResult {
    const breakdown: ConfidenceBreakdown[] = [];
    let score = BASE_CONFIDENCE;

    // ── Verification status ──────────────────────────────────────────────────
    const verifiedReps = evidence.filter(e =>
      e.type === 'verified_status' && e.verified
    );
    if (verifiedReps.some(e => e.value.toLowerCase().includes('gold'))) {
      const impact = 30;
      score += impact;
      breakdown.push({ factor: 'Gold Verified', impact, description: 'Highest trust level — verified by senior technician' });
    } else if (verifiedReps.length > 0) {
      const impact = 18;
      score += impact;
      breakdown.push({ factor: 'Verified Repair', impact, description: 'Repair has been verified by a technician' });
    }

    // ── Technician confidence ────────────────────────────────────────────────
    const techConf = evidence.find(e => e.type === 'technician_confidence');
    if (techConf) {
      const impact = Math.round((techConf.confidence - 50) * 0.15); // ±7.5 max
      score += impact;
      breakdown.push({
        factor: 'Technician Confidence',
        impact,
        description: `Technician self-rated ${techConf.confidence}% confident`,
      });
    }

    // ── DTC evidence ─────────────────────────────────────────────────────────
    const dtcs = evidence.filter(e => e.type === 'dtc');
    if (dtcs.length > 0) {
      const impact = Math.min(dtcs.length * 5, 15); // cap at 15
      score += impact;
      breakdown.push({
        factor: `${dtcs.length} DTC Code${dtcs.length > 1 ? 's' : ''} Present`,
        impact,
        description: dtcs.map(d => d.value).join(', '),
      });
    }

    // ── Symptom evidence ─────────────────────────────────────────────────────
    const symptoms = evidence.filter(e => e.type === 'symptom');
    if (symptoms.length > 0) {
      const impact = Math.min(symptoms.length * 3, 10);
      score += impact;
      breakdown.push({
        factor: `${symptoms.length} Symptom${symptoms.length > 1 ? 's' : ''} Documented`,
        impact,
        description: symptoms.map(s => s.value).slice(0, 3).join(', '),
      });
    }

    // ── Diagnostic tests ─────────────────────────────────────────────────────
    const tests = evidence.filter(e => e.type === 'test');
    if (tests.length > 0) {
      const highValueTests = tests.filter(t => t.weight >= 45);
      const impact = Math.min(tests.length * 2 + highValueTests.length * 3, 12);
      score += impact;
      breakdown.push({
        factor: `${tests.length} Diagnostic Test${tests.length > 1 ? 's' : ''} Performed`,
        impact,
        description: tests.map(t => t.value).join(', '),
      });
    }

    // ── Similar verified repairs ──────────────────────────────────────────────
    const verifiedSimilar = similarRepairs.filter(sr =>
      ['tech_verified', 'thirty_day_verified', 'gold_verified'].includes(sr.verificationStatus)
    );
    if (verifiedSimilar.length > 0) {
      const impact = Math.min(verifiedSimilar.length * 4, 16);
      score += impact;
      breakdown.push({
        factor: `${verifiedSimilar.length} Verified Similar Repair${verifiedSimilar.length > 1 ? 's' : ''}`,
        impact,
        description: `High-similarity matches found in knowledge graph`,
      });
    } else if (similarRepairs.length > 0) {
      const impact = Math.min(similarRepairs.length * 2, 8);
      score += impact;
      breakdown.push({
        factor: `${similarRepairs.length} Similar Repair${similarRepairs.length > 1 ? 's' : ''} Found`,
        impact,
        description: 'Unverified matches in knowledge graph',
      });
    }

    // ── Lesson learned ────────────────────────────────────────────────────────
    const lesson = evidence.find(e => e.type === 'technician_lesson');
    if (lesson) {
      const impact = 5;
      score += impact;
      breakdown.push({ factor: 'Lesson Learned Documented', impact, description: 'Technician captured knowledge for future repairs' });
    }

    // ── Repair procedure documented ───────────────────────────────────────────
    const procedure = evidence.find(e => e.type === 'repair_procedure');
    if (procedure) {
      const impact = 4;
      score += impact;
      breakdown.push({ factor: 'Repair Procedure Documented', impact, description: 'Final fix clearly described' });
    }

    // ── Comeback penalty ─────────────────────────────────────────────────────
    const comebacks = evidence.filter(e => e.type === 'comeback');
    let comebackPenalty = 0;
    if (comebacks.length > 0) {
      comebackPenalty = comebacks.length * 20;
      score -= comebackPenalty;
      breakdown.push({
        factor: `Comeback Penalty`,
        impact: -comebackPenalty,
        description: `Vehicle returned ${comebacks.length} time${comebacks.length > 1 ? 's' : ''} — repair may not have resolved issue`,
      });
    }

    // ── Warranty penalty ─────────────────────────────────────────────────────
    const warranties = evidence.filter(e => e.type === 'warranty');
    if (warranties.length > 0) {
      const impact = -15;
      score += impact;
      breakdown.push({ factor: 'Warranty Claim Filed', impact, description: 'Warranty claims reduce confidence in repair procedure' });
    }

    // ── Missing data deductions ───────────────────────────────────────────────
    if (dtcs.length === 0 && symptoms.length === 0) {
      const impact = -8;
      score += impact;
      breakdown.push({ factor: 'Missing Diagnostic Data', impact, description: 'No DTCs or symptoms recorded — harder to find similar cases' });
    }
    if (tests.length === 0) {
      const impact = -5;
      score += impact;
      breakdown.push({ factor: 'No Tests Recorded', impact, description: 'Diagnostic tests improve accuracy' });
    }
    if (similarRepairs.length === 0) {
      const impact = -6;
      score += impact;
      breakdown.push({ factor: 'No Similar Repairs Found', impact, description: 'First-of-kind repair in this shop\'s knowledge graph' });
    }

    // Clamp
    const overall = Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, Math.round(score)));

    // Comeback rate across similar repairs
    const avgComebackRate = similarRepairs.length > 0
      ? similarRepairs.reduce((sum, sr) => sum + (sr.outcome === 'comeback' ? 1 : 0), 0) / similarRepairs.length
      : null;
    if (avgComebackRate != null && avgComebackRate > 0) {
      breakdown.push({
        factor: 'Average Comeback Rate',
        impact: 0,
        description: `${(avgComebackRate * 100).toFixed(1)}% of similar repairs resulted in comebacks`,
      });
    }

    // Unknown risk
    const unknownRisk: ConfidenceResult['unknownRisk'] =
      overall >= 75 ? 'low' :
      overall >= 50 ? 'medium' : 'high';

    // Human-readable reasoning summary
    const verifiedCount = verifiedSimilar.length;
    const reasoning = overall >= 80
      ? `High confidence based on ${evidence.length} evidence points${verifiedCount > 0 ? ` and ${verifiedCount} verified similar repair${verifiedCount > 1 ? 's' : ''}` : ''}.`
      : overall >= 60
      ? `Moderate confidence. ${dtcs.length > 0 ? 'DTCs documented. ' : 'Consider adding DTCs. '}${tests.length === 0 ? 'Diagnostic tests would improve accuracy.' : ''}`
      : `Low confidence. More data needed: ${[
          dtcs.length === 0 && 'DTCs',
          symptoms.length === 0 && 'symptoms',
          tests.length === 0 && 'diagnostic tests',
        ].filter(Boolean).join(', ')}.`;

    return {
      overall,
      breakdown: breakdown.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)),
      evidenceCount: evidence.length,
      verifiedRepairCount: verifiedCount,
      comebackPenalty,
      unknownRisk,
      reasoning,
    };
  }
}
