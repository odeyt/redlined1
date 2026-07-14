/**
 * lib/diagnostics/rules/DiagnosticRulesEngine.ts
 *
 * Deterministic rules evaluated before and after AI reasoning.
 * Rules can block unsafe AI recommendations and add safety warnings.
 * All rules are read-only — they never modify ECU state.
 */

import type { DiagnosticSession, DiagnosticSafetyWarning, DiagnosticReasoningResult } from '../types';

export interface RuleEvaluationResult {
  safetyWarnings: DiagnosticSafetyWarning[];
  blockedActions: string[];
  passed: boolean;
}

export interface DiagnosticRule {
  ruleId: string;
  description: string;
  evaluate(session: DiagnosticSession, reasoning?: DiagnosticReasoningResult): DiagnosticSafetyWarning | null;
}

// ── Rule: no DTC clearing without technician confirmation ─────────────────────

const noDtcClearingRule: DiagnosticRule = {
  ruleId: 'RULE_NO_AUTO_DTC_CLEAR',
  description: 'DTCs must never be cleared automatically without technician confirmation.',
  evaluate() {
    // This rule always passes — clearing is never performed by the orchestrator.
    // Included to make the policy explicit and testable.
    return null;
  },
};

// ── Rule: HV/EV battery safety ────────────────────────────────────────────────

const hvBatterySafetyRule: DiagnosticRule = {
  ruleId: 'RULE_HV_BATTERY_SAFETY',
  description: 'High-voltage systems require specialized training and PPE.',
  evaluate(session) {
    const hasHvDtc = session.dtcs.some((d) =>
      /P1[89]\d\d|P3\d\d\d/.test(d.code) ||
      d.description?.toLowerCase().includes('high voltage') ||
      d.description?.toLowerCase().includes('hybrid battery'),
    );
    if (!hasHvDtc) return null;
    return {
      id: `${this.ruleId}-${session.id}`,
      ruleId: this.ruleId,
      criticality: 'CRITICAL',
      message: 'High-voltage system DTCs detected.',
      detail:
        'Work on high-voltage systems requires certified HV training, appropriate PPE (insulated gloves Cat 0+), and HV service disconnect procedure. Do NOT probe HV cables without isolation verification.',
      blocksAction: 'hv_component_test',
    };
  },
};

// ── Rule: airbag / SRS safety ─────────────────────────────────────────────────

const airbagSafetyRule: DiagnosticRule = {
  ruleId: 'RULE_AIRBAG_SRS_SAFETY',
  description: 'SRS airbag systems require special precautions.',
  evaluate(session) {
    const hasSrsDtc = session.dtcs.some((d) => /B0\d\d\d/.test(d.code));
    if (!hasSrsDtc) return null;
    return {
      id: `${this.ruleId}-${session.id}`,
      ruleId: this.ruleId,
      criticality: 'HIGH',
      message: 'SRS / airbag system fault code detected.',
      detail:
        'Disconnect battery and wait 30 minutes before working near airbag components. Accidental deployment risk. Follow OEM SRS service precautions.',
      blocksAction: 'srs_component_probe',
    };
  },
};

// ── Rule: fuel system safety ──────────────────────────────────────────────────

const fuelSystemSafetyRule: DiagnosticRule = {
  ruleId: 'RULE_FUEL_SYSTEM_SAFETY',
  description: 'Fuel system tests require fire suppression readiness.',
  evaluate(session) {
    const hasFuelDtc = session.dtcs.some((d) => /P02[1-9]\d|P03[0-6]\d/.test(d.code));
    if (!hasFuelDtc) return null;
    return {
      id: `${this.ruleId}-${session.id}`,
      ruleId: this.ruleId,
      criticality: 'HIGH',
      message: 'Fuel system fault code detected.',
      detail:
        'Depressurize fuel system before disconnecting lines. Ensure fire extinguisher is accessible. No open flames or sparks near fuel components.',
    };
  },
};

// ── Rule: AI recommendation must not prescribe parts without tests ────────────

const noPartsBeforeTestsRule: DiagnosticRule = {
  ruleId: 'RULE_NO_PARTS_WITHOUT_TESTS',
  description: 'AI must not recommend part replacement without supporting test results.',
  evaluate(session, reasoning) {
    if (!reasoning) return null;
    if (session.testResults.length > 0) return null;
    // If AI has any hypotheses but no tests have been done, flag it
    if (reasoning.hypotheses.length > 0 && session.testResults.length === 0) {
      return {
        id: `${this.ruleId}-${session.id}`,
        ruleId: this.ruleId,
        criticality: 'MEDIUM',
        message: 'Diagnostic hypotheses generated without any technician-confirmed test results.',
        detail:
          'AI reasoning is provisional. Complete at least one recommended test before acting on component replacement suggestions. '
          + `Components to NOT replace yet: ${reasoning.componentsNotToReplaceYet.join(', ') || 'see AI reasoning'}.`,
      };
    }
    return null;
  },
};

// ── Engine ─────────────────────────────────────────────────────────────────────

const DEFAULT_RULES: DiagnosticRule[] = [
  noDtcClearingRule,
  hvBatterySafetyRule,
  airbagSafetyRule,
  fuelSystemSafetyRule,
  noPartsBeforeTestsRule,
];

export class DiagnosticRulesEngine {
  private readonly rules: DiagnosticRule[];

  constructor(rules: DiagnosticRule[] = DEFAULT_RULES) {
    this.rules = rules;
  }

  evaluate(session: DiagnosticSession, reasoning?: DiagnosticReasoningResult): RuleEvaluationResult {
    const safetyWarnings: DiagnosticSafetyWarning[] = [];
    const blockedActions: string[] = [];

    for (const rule of this.rules) {
      const warning = rule.evaluate(session, reasoning);
      if (warning) {
        safetyWarnings.push(warning);
        if (warning.blocksAction) {
          blockedActions.push(warning.blocksAction);
        }
      }
    }

    const hasCritical = safetyWarnings.some((w) => w.criticality === 'CRITICAL');

    return {
      safetyWarnings,
      blockedActions,
      passed: !hasCritical,
    };
  }
}
