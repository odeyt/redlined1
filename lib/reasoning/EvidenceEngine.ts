/**
 * RedlineD1 — Evidence Engine
 * Sprint 6 — ERE Part 2 & 3
 *
 * Converts raw repair case data into weighted, ranked evidence objects.
 * Every claim the Reasoning Engine makes must be backed by evidence here.
 */

import {
  Evidence,
  EvidenceType,
  EvidenceWeights,
  DEFAULT_EVIDENCE_WEIGHTS,
  ReasoningInput,
} from './types';

// ─── ID generation (no external dep) ─────────────────────────────────────────

function eid(prefix: string, value: string): string {
  return `${prefix}:${value.toLowerCase().replace(/\s+/g, '_').slice(0, 48)}`;
}

// ─── Test → evidence weight mapping ──────────────────────────────────────────

const TEST_WEIGHT_MAP: Record<string, keyof EvidenceWeights> = {
  'oscilloscope':            'oscilloscope',
  'voltage test':            'voltage_measurement',
  'resistance test':         'voltage_measurement',
  'pressure test':           'pressure_measurement',
  'smoke test':              'smoke_test',
  'compression test':        'compression_test',
  'programming':             'programming_success',
  'calibration':             'programming_success',
  'scope capture':           'scope_capture',
};

function testWeight(testName: string, weights: EvidenceWeights): number {
  const lower = testName.toLowerCase();
  for (const [key, weightKey] of Object.entries(TEST_WEIGHT_MAP)) {
    if (lower.includes(key)) return weights[weightKey];
  }
  return 20; // default for unlisted tests
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export class EvidenceEngine {
  private readonly weights: EvidenceWeights;

  constructor(weightOverrides?: Partial<EvidenceWeights>) {
    this.weights = { ...DEFAULT_EVIDENCE_WEIGHTS, ...(weightOverrides ?? {}) };
  }

  /**
   * Collect and score all evidence from a repair case input.
   * Returns evidence sorted by weight descending (highest impact first).
   */
  collect(input: ReasoningInput): Evidence[] {
    const now = new Date().toISOString();
    const cid = input.repairCaseId;
    const evidence: Evidence[] = [];

    const verified = ['tech_verified', 'thirty_day_verified', 'gold_verified']
      .includes(input.verificationStatus);
    const gold = input.verificationStatus === 'gold_verified';

    // ── Verification status ──────────────────────────────────────────────────
    if (gold) {
      evidence.push({
        id: eid('verified', 'gold'),
        type: 'verified_status',
        value: 'Gold Verified',
        weight: this.weights.gold_verified,
        source: 'system',
        repairCaseId: cid,
        verified: true,
        confidence: 100,
        timestamp: now,
      });
    } else if (verified) {
      evidence.push({
        id: eid('verified', input.verificationStatus),
        type: 'verified_status',
        value: input.verificationStatus.replace(/_/g, ' '),
        weight: this.weights.verified_repair,
        source: 'system',
        repairCaseId: cid,
        verified: true,
        confidence: 90,
        timestamp: now,
      });
    }

    // ── Technician confidence ────────────────────────────────────────────────
    if (input.confidenceScore != null && input.confidenceScore > 0) {
      evidence.push({
        id: eid('confidence', String(input.confidenceScore)),
        type: 'technician_confidence',
        value: `${input.confidenceScore}%`,
        weight: Math.round(input.confidenceScore * 0.8), // scaled to ~80 max
        source: 'technician',
        repairCaseId: cid,
        verified,
        confidence: input.confidenceScore,
        timestamp: now,
        metadata: { rawScore: input.confidenceScore },
      });
    }

    // ── DTCs ─────────────────────────────────────────────────────────────────
    for (const code of input.dtcCodes) {
      evidence.push({
        id: eid('dtc', code),
        type: 'dtc',
        value: code.toUpperCase(),
        weight: this.weights.dtc_match,
        source: 'repair_case',
        repairCaseId: cid,
        verified,
        confidence: verified ? 90 : 70,
        timestamp: now,
      });
    }

    // ── Symptoms ─────────────────────────────────────────────────────────────
    for (const symptom of input.symptoms) {
      evidence.push({
        id: eid('symptom', symptom),
        type: 'symptom',
        value: symptom,
        weight: this.weights.symptom_match,
        source: 'repair_case',
        repairCaseId: cid,
        verified,
        confidence: verified ? 80 : 60,
        timestamp: now,
      });
    }

    // ── Tests performed ───────────────────────────────────────────────────────
    for (const test of input.testsPerformed) {
      evidence.push({
        id: eid('test', test),
        type: 'test',
        value: test,
        weight: testWeight(test, this.weights),
        source: 'repair_case',
        repairCaseId: cid,
        verified,
        confidence: verified ? 85 : 65,
        timestamp: now,
      });
    }

    // ── Parts replaced ────────────────────────────────────────────────────────
    for (const part of input.partsReplaced) {
      evidence.push({
        id: eid('part', part),
        type: 'part',
        value: part,
        weight: this.weights.part_match,
        source: 'repair_case',
        repairCaseId: cid,
        verified,
        confidence: verified ? 85 : 65,
        timestamp: now,
      });
    }

    // ── Final fix / repair procedure ──────────────────────────────────────────
    if (input.finalFix) {
      evidence.push({
        id: eid('procedure', input.finalFix),
        type: 'repair_procedure',
        value: input.finalFix,
        weight: this.weights.procedure_match,
        source: 'repair_case',
        repairCaseId: cid,
        verified,
        confidence: verified ? 90 : 65,
        timestamp: now,
      });
    }

    // ── Outcomes ─────────────────────────────────────────────────────────────
    for (const o of input.outcomes ?? []) {
      if (o.verifiedFix) {
        evidence.push({
          id: eid('outcome', 'verified_fix'),
          type: 'repair_outcome',
          value: 'Verified Fix',
          weight: this.weights.successful_repair,
          source: 'system',
          repairCaseId: cid,
          verified: true,
          confidence: 95,
          timestamp: now,
          metadata: { outcome: o.outcome },
        });
      }
      if (o.comeback) {
        evidence.push({
          id: eid('outcome', 'comeback'),
          type: 'comeback',
          value: 'Comeback',
          weight: this.weights.comeback_penalty,
          source: 'system',
          repairCaseId: cid,
          verified: true,
          confidence: 100,
          timestamp: now,
        });
      }
      if (o.warrantyClaim) {
        evidence.push({
          id: eid('outcome', 'warranty'),
          type: 'warranty',
          value: 'Warranty Claim',
          weight: this.weights.warranty_failure_penalty,
          source: 'system',
          repairCaseId: cid,
          verified: true,
          confidence: 100,
          timestamp: now,
        });
      }
    }

    // ── Lesson learned ────────────────────────────────────────────────────────
    if (input.lessonLearned) {
      evidence.push({
        id: eid('lesson', input.lessonLearned),
        type: 'technician_lesson',
        value: input.lessonLearned,
        weight: this.weights.lesson_learned,
        source: 'technician',
        repairCaseId: cid,
        verified,
        confidence: verified ? 80 : 55,
        timestamp: now,
      });
    }

    // ── Similar repairs (from graph) ──────────────────────────────────────────
    for (const sr of input.similarRepairs ?? []) {
      const isVerified = ['tech_verified', 'thirty_day_verified', 'gold_verified']
        .includes(sr.verificationStatus);
      const srWeight = isVerified
        ? (sr.verificationStatus === 'gold_verified' ? this.weights.gold_verified : this.weights.verified_repair)
        : this.weights.successful_repair;

      evidence.push({
        id: eid('similar', `${sr.make ?? ''}_${sr.model ?? ''}_${sr.similarityScore}`),
        type: 'repair_outcome',
        value: `Similar repair: ${[sr.year, sr.make, sr.model].filter(Boolean).join(' ')} — ${sr.finalFix ?? 'unknown fix'}`,
        weight: Math.round(srWeight * (sr.similarityScore / 100)),
        source: 'knowledge_graph',
        repairCaseId: null,
        verified: isVerified,
        confidence: Math.round(sr.confidence * 100),
        timestamp: now,
        metadata: {
          similarityScore: sr.similarityScore,
          finalFix: sr.finalFix,
          outcome: sr.outcome,
        },
      });
    }

    // Sort by absolute weight (highest impact first, penalties after positives)
    return evidence.sort((a, b) => b.weight - a.weight);
  }

  /** Filter to only positive evidence (for recommendation building). */
  positive(evidence: Evidence[]): Evidence[] {
    return evidence.filter(e => e.weight > 0);
  }

  /** Filter to only penalty evidence. */
  penalties(evidence: Evidence[]): Evidence[] {
    return evidence.filter(e => e.weight < 0);
  }

  /** Sum of all weights. */
  totalWeight(evidence: Evidence[]): number {
    return evidence.reduce((sum, e) => sum + e.weight, 0);
  }
}
