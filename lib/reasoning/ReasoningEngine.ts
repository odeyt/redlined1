/**
 * RedlineD1 — Reasoning Engine
 * Sprint 6 — ERE Orchestrator (Part 7 & 9)
 *
 * Orchestrates the full ERE pipeline:
 * Input → Evidence → Confidence → Recommendations → Known Unknowns → Context
 *
 * Also maintains the Reasoning Timeline for developer/admin observability.
 */

import { EvidenceEngine } from './EvidenceEngine';
import { ConfidenceEngine } from './ConfidenceEngine';
import { RecommendationEngine } from './RecommendationEngine';
import { ContextBuilder } from './ContextBuilder';
import { ERECache } from './cache';
import {
  ReasoningInput,
  ReasoningResult,
  KnownUnknown,
  ReasoningTimeline,
  ReasoningTimelineStep,
  Evidence,
} from './types';

// ─── Timeline helpers ─────────────────────────────────────────────────────────

function stepLabel(n: number): string {
  return [
    'Evidence Collected',
    'Evidence Ranked',
    'Confidence Calculated',
    'Recommendations Generated',
    'LLM Context Built',
  ][n - 1] ?? `Step ${n}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export class ReasoningEngine {
  private readonly evidenceEngine:       EvidenceEngine;
  private readonly confidenceEngine:     ConfidenceEngine;
  private readonly recommendationEngine: RecommendationEngine;
  private readonly contextBuilder:       ContextBuilder;
  private readonly cache:                ERECache;

  constructor() {
    this.evidenceEngine       = new EvidenceEngine();
    this.confidenceEngine     = new ConfidenceEngine();
    this.recommendationEngine = new RecommendationEngine();
    this.contextBuilder       = new ContextBuilder();
    this.cache                = new ERECache();
  }

  /**
   * Run the full reasoning pipeline for a repair case.
   * Target: <200ms total (pure computation, no I/O).
   */
  async reason(input: ReasoningInput): Promise<ReasoningResult> {
    const cacheKey = this.buildCacheKey(input);

    // Check cache
    const cached = this.cache.get<ReasoningResult>(cacheKey);
    if (cached) return cached;

    const start = Date.now();
    const steps: ReasoningTimelineStep[] = [];
    let stepStart = start;

    // ── Step 1: Collect & rank evidence ──────────────────────────────────────
    const evidence = this.evidenceEngine.collect({
      ...input,
      weightOverrides: input.weightOverrides,
    });
    const s1 = Date.now();
    steps.push(this.step(1, stepLabel(1), stepStart, s1, `${evidence.length} evidence items`));
    stepStart = s1;

    // ── Step 2: Evidence already ranked by EvidenceEngine (sort by weight) ───
    // (ranking is embedded in collect())
    const s2 = Date.now();
    steps.push(this.step(2, stepLabel(2), s1, s2, `Top weight: ${evidence[0]?.weight ?? 0}`));
    stepStart = s2;

    // ── Step 3: Calculate confidence ─────────────────────────────────────────
    const confidence = this.confidenceEngine.calculate(
      evidence,
      input.similarRepairs ?? [],
      input.verificationStatus,
    );
    const s3 = Date.now();
    steps.push(this.step(3, stepLabel(3), stepStart, s3, `${confidence.overall}% — ${confidence.unknownRisk} risk`));
    stepStart = s3;

    // ── Step 4: Generate recommendations ─────────────────────────────────────
    const recommendations = this.recommendationEngine.generate(
      input,
      evidence,
      input.similarRepairs ?? [],
      input.lessons ?? [],
    );
    const s4 = Date.now();
    steps.push(this.step(4, stepLabel(4), stepStart, s4, `${recommendations.length} recommendations`));
    stepStart = s4;

    // ── Step 5: Identify known unknowns ──────────────────────────────────────
    const knownUnknowns = this.identifyKnownUnknowns(input, evidence, confidence.overall);

    // ── Step 5b: Build LLM context ────────────────────────────────────────────
    const llmContext = this.contextBuilder.build(
      input,
      evidence,
      confidence,
      recommendations,
      knownUnknowns,
      cacheKey,
    );
    const s5 = Date.now();
    steps.push(this.step(5, stepLabel(5), stepStart, s5, `${knownUnknowns.length} known unknowns`));

    const timeline: ReasoningTimeline = {
      steps,
      totalMs: s5 - start,
    };

    const result: ReasoningResult = {
      input,
      evidence,
      confidence,
      recommendations,
      knownUnknowns,
      timeline,
      llmContext,
      cacheKey,
    };

    // Cache result
    this.cache.set(cacheKey, result, 'RECOMMENDATIONS');

    return result;
  }

  /**
   * Invalidate cached reasoning when a repair case is updated.
   */
  invalidate(repairCaseId: string): void {
    this.cache.invalidateByRepairCase(repairCaseId);
  }

  // ── Known Unknowns ────────────────────────────────────────────────────────

  private identifyKnownUnknowns(
    input: ReasoningInput,
    evidence: Evidence[],
    confidenceScore: number,
  ): KnownUnknown[] {
    const unknowns: KnownUnknown[] = [];

    // Missing measurements
    const hasOscilloscope = input.testsPerformed.some(t => t.toLowerCase().includes('oscilloscope'));
    const hasVoltage      = input.testsPerformed.some(t => t.toLowerCase().includes('voltage'));
    const hasPressure     = input.testsPerformed.some(t => t.toLowerCase().includes('pressure'));

    if (input.dtcCodes.some(c => /^P0[34]/.test(c)) && !hasPressure) {
      unknowns.push({
        type: 'missing_measurement',
        description: 'Fuel/exhaust DTCs present but no pressure measurement recorded',
        severity: 'high',
        suggestedAction: 'Perform fuel rail pressure test and record measurement',
      });
    }

    if (input.dtcCodes.some(c => /^P0[12]/.test(c)) && !hasVoltage) {
      unknowns.push({
        type: 'missing_measurement',
        description: 'Ignition/fuel DTCs present but no voltage test recorded',
        severity: 'medium',
        suggestedAction: 'Perform voltage drop test on relevant circuits',
      });
    }

    // Missing tests
    if (input.testsPerformed.length === 0) {
      unknowns.push({
        type: 'missing_test',
        description: 'No diagnostic tests were recorded for this repair case',
        severity: 'high',
        suggestedAction: 'Document all tests performed to improve future recommendations',
      });
    }

    if (input.symptoms.length === 0 && input.dtcCodes.length === 0) {
      unknowns.push({
        type: 'missing_data',
        description: 'Neither symptoms nor DTCs recorded — low diagnostic traceability',
        severity: 'high',
        suggestedAction: 'Add customer complaint details, symptoms, and any stored fault codes',
      });
    }

    // Missing final fix
    if (!input.finalFix) {
      unknowns.push({
        type: 'missing_data',
        description: 'No final repair procedure documented',
        severity: 'medium',
        suggestedAction: 'Document exactly what was done to resolve the issue',
      });
    }

    // Conflicting evidence — comeback + verified fix
    const hasVerifiedFix = input.outcomes?.some(o => o.verifiedFix) ?? false;
    const hasComeback    = input.outcomes?.some(o => o.comeback)    ?? false;
    if (hasVerifiedFix && hasComeback) {
      unknowns.push({
        type: 'conflicting_evidence',
        description: 'Case is marked both "Verified Fix" and "Comeback" — conflicting outcome data',
        severity: 'high',
        suggestedAction: 'Review outcome records and correct the verification status',
      });
    }

    // Low confidence
    if (confidenceScore < 50) {
      unknowns.push({
        type: 'low_confidence',
        description: `Overall confidence is ${confidenceScore}% — insufficient evidence to draw strong conclusions`,
        severity: 'high',
        suggestedAction: 'Add verification, tests, DTCs, and symptoms to improve confidence',
      });
    } else if (confidenceScore < 65) {
      unknowns.push({
        type: 'low_confidence',
        description: `Confidence is ${confidenceScore}% — moderate uncertainty remains`,
        severity: 'medium',
        suggestedAction: 'Verify repair outcome and document any follow-up observations',
      });
    }

    // Missing oscilloscope for electrical faults
    const electricalDtcs = input.dtcCodes.filter(c =>
      /^[PBC]0[67]/.test(c) || /^U0/.test(c)
    );
    if (electricalDtcs.length > 0 && !hasOscilloscope) {
      unknowns.push({
        type: 'missing_test',
        description: `Electrical DTCs (${electricalDtcs.join(', ')}) present but no oscilloscope test recorded`,
        severity: 'medium',
        suggestedAction: 'Oscilloscope waveform capture improves electrical fault accuracy',
      });
    }

    // Sort: high first, then medium
    return unknowns.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.severity] - order[b.severity];
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private step(
    n: number,
    label: string,
    from: number,
    to: number,
    detail?: string,
  ): ReasoningTimelineStep {
    return { step: n, label, completedAt: new Date(to).toISOString(), durationMs: to - from, detail };
  }

  private buildCacheKey(input: ReasoningInput): string {
    const parts = [
      input.repairCaseId,
      input.verificationStatus,
      input.dtcCodes.sort().join(','),
      input.symptoms.length,
      input.similarRepairs?.length ?? 0,
      input.confidenceScore ?? 0,
    ];
    return `ere:${parts.join('|')}`;
  }
}
