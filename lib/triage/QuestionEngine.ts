/**
 * Automotive Triage Engine — Question Engine
 * Main orchestrator. Coordinates QuestionFlow, summary building,
 * inspection suggestions, quality scoring, and context building.
 */

import { CategoryId, AnswerMap, TriageSession, TriageVehicle, TechnicianNotes, Question } from './QuestionTypes';
import { QuestionFlow } from './QuestionFlow';
import { buildComplaintSummary } from './ComplaintSummaryBuilder';
import { getInspectionSuggestions } from './InspectionSuggestions';
import { scoreDataQuality } from './DataQualityScorer';
import { buildTriageContext } from './triageContextBuilder';

export class QuestionEngine {
  private flow: QuestionFlow | null = null;

  // ── Flow management ─────────────────────────────────────────────────────────

  setCategory(categoryId: CategoryId): void {
    this.flow = new QuestionFlow(categoryId);
  }

  getActiveQuestions(answers: AnswerMap): Question[] {
    if (!this.flow) return [];
    return this.flow.getActiveQuestions(answers);
  }

  getMissingRequired(answers: AnswerMap): string[] {
    if (!this.flow) return [];
    return this.flow.getMissingRequired(answers);
  }

  getProgress(answers: AnswerMap): { answered: number; total: number } {
    if (!this.flow) return { answered: 0, total: 0 };
    return this.flow.getProgress(answers);
  }

  // ── Session compilation ──────────────────────────────────────────────────────

  /**
   * Compile a complete triage session from the collected data.
   * Generates summary, suggestions, quality score, and AI context.
   */
  compileSession(
    shopId: string,
    vehicle: TriageVehicle,
    categoryId: CategoryId,
    answers: AnswerMap,
    techNotes: TechnicianNotes,
  ): TriageSession {
    const complaintSummary  = buildComplaintSummary(categoryId, answers);
    const inspectionSuggestions = getInspectionSuggestions(categoryId);
    const dataQualityScore  = scoreDataQuality(vehicle, categoryId, answers, techNotes);

    return {
      shopId,
      vehicle,
      categoryId,
      answers,
      techNotes,
      complaintSummary,
      inspectionSuggestions,
      dataQualityScore,
      status: 'draft',
    };
  }

  // ── Context export for future AI ─────────────────────────────────────────────

  buildAIContext(session: TriageSession): ReturnType<typeof buildTriageContext> {
    return buildTriageContext(session);
  }
}
