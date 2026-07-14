/**
 * lib/diagnostics/providers/MockReasoningProvider.ts
 *
 * Deterministic mock for testing and development.
 * Never calls an external API. All outputs are stable fixtures.
 * Used when diagnostic_ai_reasoning_enabled flag is OFF.
 */

import type {
  DiagnosticReasoningProvider,
  DiagnosticReasoningContext,
  DiagnosticReviewProvider,
  DiagnosticReviewContext,
} from './DiagnosticReasoningProvider';
import type { DiagnosticReasoningResult, DiagnosticReviewResult } from '../types';
import { DiagnosticReasoningResultSchema, DiagnosticReviewResultSchema } from '../schemas';

export class MockReasoningProvider implements DiagnosticReasoningProvider {
  readonly providerName = 'mock';
  readonly modelName = 'mock-reasoning-v1';
  readonly isSimulated = true;

  async reason(ctx: DiagnosticReasoningContext): Promise<DiagnosticReasoningResult> {
    const dtcCodes = ctx.session.dtcs.map((d) => d.code).join(', ') || 'no DTCs';
    const now = new Date().toISOString();

    const raw = {
      caseSummary: `[SIMULATED] Session ${ctx.session.id} — DTCs present: ${dtcCodes}. This is a deterministic mock response for development and testing.`,
      identifiedSystem: ctx.session.dtcs[0]?.system ?? 'UNKNOWN',
      dtcRelationships: `[SIMULATED] ${dtcCodes} — relationships not yet determined in mock mode.`,
      hypotheses: [
        {
          description: '[SIMULATED] Mock hypothesis — replace with real reasoning when flag is enabled.',
          confidenceNote: 'Insufficient evidence — this is a simulated session.',
          evidenceFor: ['DTCs present in scan data'],
          evidenceAgainst: ['No live data captured', 'No freeze frame analysis performed'],
          assumptions: ['Vehicle is representative of the stated symptom'],
        },
      ],
      contradictions: [],
      missingData: ['Live data capture', 'Freeze frame analysis', 'Symptom confirmation'],
      nextRecommendedTest: {
        title: '[SIMULATED] Capture live data at idle',
        rationale: 'Baseline live data is required before meaningful reasoning.',
        requiredTools: ['Scan tool with live data capability'],
        testConditions: 'Engine warmed to operating temperature, idle 750 rpm',
        expectedResults: 'Stable readings within OEM specification',
        decisionBranches: [
          { condition: 'All PIDs within spec', conclusion: 'Intermittent fault suspected' },
          { condition: 'Any PID out of range', conclusion: 'Proceed to component-level test' },
        ],
      },
      safetyWarnings: [],
      componentsNotToReplaceYet: ['Any component'],
      evidenceQuality: 'LOW' as const,
      provisionalConfidence: 10,
      assumptions: ['[SIMULATED] This is a mock session. Enable diagnostic_ai_reasoning_enabled for real AI.'],
    };

    // Validate own output before returning
    const validated = DiagnosticReasoningResultSchema.parse(raw);

    return {
      id: `mock-reasoning-${Date.now()}`,
      sessionId: ctx.session.id,
      shopId: ctx.shopId,
      modelProvider: this.providerName,
      modelName: this.modelName,
      promptVersion: ctx.promptVersion,
      engineVersion: ctx.engineVersion,
      isAiDerived: true,
      safetyStatus: 'CLEAR',
      createdAt: now,
      validatedAt: now,
      ...validated,
    };
  }
}

export class MockReviewProvider implements DiagnosticReviewProvider {
  readonly providerName = 'mock';
  readonly modelName = 'mock-review-v1';
  readonly isSimulated = true;

  async review(ctx: DiagnosticReviewContext): Promise<DiagnosticReviewResult> {
    const now = new Date().toISOString();

    const raw = {
      agreesWithPrimary: true,
      disagreementPoints: [],
      unsupportedAssumptions: ctx.primaryReasoning.assumptions.filter((a) =>
        a.startsWith('[SIMULATED]'),
      ),
      missingPrerequisiteTests: ['Live data capture at idle', 'Freeze frame review'],
      unsafeRecommendations: [],
      evidenceQualityConcerns: ['Evidence quality is LOW — simulated session'],
      suggestedCorrections: [],
      severity: 'INFORMATIONAL' as const,
      approvalState: 'APPROVED_WITH_CAVEATS' as const,
    };

    const validated = DiagnosticReviewResultSchema.parse(raw);

    return {
      id: `mock-review-${Date.now()}`,
      sessionId: ctx.session.id,
      shopId: ctx.shopId,
      primaryReasoningId: ctx.primaryReasoning.id,
      modelProvider: this.providerName,
      modelName: this.modelName,
      promptVersion: ctx.promptVersion,
      isAiDerived: true,
      createdAt: now,
      validatedAt: now,
      ...validated,
    };
  }
}
